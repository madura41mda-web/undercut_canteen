param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'Set SUPABASE_DB_URL or pass -DatabaseUrl for a disposable test database.'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql is required for this two-session concurrency test.'
}

$testId = "last-item-$([guid]::NewGuid().ToString('N'))"
$setupSql = @"
insert into public.menu_items (id, name, category, price, prep_time_minutes, stock, daily_limit, counter)
values ('$testId', 'Concurrent Test Item', 'Tests', 1, 1, 1, 10, 'Test Counter');
"@
& psql --dbname=$DatabaseUrl -X -v ON_ERROR_STOP=1 -q -c $setupSql | Out-Null

$callSql = @"
select public.place_order(
  'Concurrent Tester', 'CONCURRENT',
  '[{"id":"$testId","quantity":1}]'::jsonb,
  now() + interval '30 minutes', 'NORMAL', null, 'UPI'
);
"@

try {
  $first = Start-Job -ArgumentList $DatabaseUrl, $callSql -ScriptBlock {
    param($url, $sql)
    psql --dbname=$url -X -v ON_ERROR_STOP=1 -q -t -A -c $sql
  }
  $second = Start-Job -ArgumentList $DatabaseUrl, $callSql -ScriptBlock {
    param($url, $sql)
    psql --dbname=$url -X -v ON_ERROR_STOP=1 -q -t -A -c $sql
  }
  $responses = @(Receive-Job -Job $first -Wait -AutoRemoveJob; Receive-Job -Job $second -Wait -AutoRemoveJob) |
    Where-Object { $_ -and $_.Trim() } |
    ForEach-Object { $_ | ConvertFrom-Json }

  $successes = @($responses | Where-Object { $_.ok -eq $true })
  $soldOut = @($responses | Where-Object { $_.reason -eq 'sold_out' })
  $stock = & psql --dbname=$DatabaseUrl -X -v ON_ERROR_STOP=1 -q -t -A -c "select stock from public.menu_items where id = '$testId';"
  if ($successes.Count -ne 1 -or $soldOut.Count -ne 1 -or [int]$stock.Trim() -ne 0) {
    throw 'Expected one success, one sold_out result, and zero remaining stock.'
  }
  Write-Output 'PASS: concurrent last-item ordering is atomic.'
}
finally {
  & psql --dbname=$DatabaseUrl -X -v ON_ERROR_STOP=1 -q -c "delete from public.menu_items where id = '$testId';" | Out-Null
}
