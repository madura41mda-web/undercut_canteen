-- SmartCanteen demo menu, copied from src/data/mockMenu.js.
-- initial_stock mirrors stock so demo_reset can restore defaults.
insert into public.menu_items (
  id, name, category, price, prep_time_minutes, calories, is_veg, rating, review_count,
  description, image, stock, initial_stock, daily_limit, tags, badge, counter, is_active
) values
  ('item-1',  'Crispy Masala Dosa',          'South Indian',  65, 8, 320, true, 4.8, 284, 'Golden crisp crepe made from fermented rice-lentil batter, stuffed with spiced potato mash and served with fresh coconut chutney & piping hot sambar.',                                 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=800&auto=format&fit=crop&q=80',  18, 18, 60,  array['Best Seller','Fast Batch'],       'Popular',          'Counter 1 (South Specials)',  true),
  ('item-2',  'Paneer Tikka Roll',            'Quick Bites',   85,10, 410, true, 4.9, 312, 'Smoky grilled cottage cheese cubes wrapped in flaky whole wheat paratha with mint mayo, pickled red onions, and chaat spices.',                                                           'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=800&auto=format&fit=crop&q=80',   4,  4, 40,  array['Chef Special','High Protein'],    'Only 4 Left',      'Counter 2 (Grill & Wraps)',   true),
  ('item-3',  'Punjabi Chole Bhature',        'North Indian',  90,12, 550, true, 4.7, 195, 'Two fluffy puffed bhaturas served with slow-simmered zesty chickpea gravy, lemon wedge, and fried green chilies.',                                                                       'https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=800&auto=format&fit=crop&q=80',  12, 12, 50,  array['Student Favorite'],               'Hearty Meal',      'Counter 3 (Curries)',         true),
  ('item-4',  'Cold Brew Hazelnut Coffee',    'Beverages',     45, 3, 140, true, 4.9, 420, 'Thick creamy chilled espresso blend infused with roasted hazelnut syrup and ice crystals. Instant pick-me-up between lectures.',                                                          'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=800&auto=format&fit=crop&q=80',  35, 35,100,  array['Instant Prep','Chilled'],         '⚡ 3 Mins',         'Counter 4 (Beverage Bar)',    true),
  ('item-5',  'Schezwan Veg Hakka Noodles',   'Bowls & Wok',  75, 9, 380, true, 4.6, 167, 'Wok-tossed noodles with crunchy bell peppers, shredded cabbage, spring onions, and fiery house-made schezwan sauce.',                                                                     'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&auto=format&fit=crop&q=80',  15, 15, 45,  array['Spicy','Fast Batch'],              'Wok Fresh',        'Counter 2 (Wok Station)',     true),
  ('item-6',  'Street Style Samosa Chaat',    'Quick Bites',   40, 5, 290, true, 4.8, 390, 'Crushed flaky potato samosas drenched in warm ragda curry, sweetened tamarind chutney, mint drizzle, and crispy nylon sev.',                                                             'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&auto=format&fit=crop&q=80',   8,  8, 80,  array['Budget Friendly','Instant Prep'], 'Crowd Favorite',   'Counter 1 (Chaat Counter)',   true),
  ('item-7',  'Hyderabadi Dum Veg Biryani',   'Bowls & Wok', 110, 7, 490, true, 4.9, 275, 'Fragrant long-grain basmati rice layered with garden vegetables, saffron milk, and aromatic spices. Served with creamy cucumber salan & raita.',                                          'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80',   0,  0, 30,  array['Weekend Special'],                'Sold Out',         'Counter 3 (Rice Bowls)',      true),
  ('item-8',  'Triple Cheese Grilled Sandwich','Quick Bites',  70, 6, 360, true, 4.7, 220, 'Butter-toasted jumbo artisanal bread packed with melted mozzarella, cheddar, green bell peppers, sweet corn, and oregano seasoning.',                                                    'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&auto=format&fit=crop&q=80',  14, 14, 55,  array['Cheesy','Kids & Youth'],          'Comfort Food',     'Counter 2 (Sandwich Press)',  true),
  ('item-9',  'Belgian Chocolate Brownie Shake','Beverages',   60, 4, 340, true, 4.8, 180, 'Rich dark chocolate shake blended with crumbled fudge brownie, topped with cocoa dusting and dark chocolate drizzle.',                                                                   'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&auto=format&fit=crop&q=80',  22, 22, 60,  array['Dessert Drink','Sweet'],          'Best Beverage',    'Counter 4 (Beverage Bar)',    true),
  ('item-10', 'Idli Vada Sambar Combo',        'South Indian',  55, 4, 270, true, 4.7, 340, 'Two melt-in-mouth steamed idlis and one crispy medu vada served with piping hot dal sambar and spicy tomato chutney.',                                                                    'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',   2,  2, 75,  array['Light & Healthy','Fast Prep'],    'Only 2 Left',      'Counter 1 (South Specials)',  true)
on conflict (id) do update set
  name               = excluded.name,
  category           = excluded.category,
  price              = excluded.price,
  prep_time_minutes  = excluded.prep_time_minutes,
  calories           = excluded.calories,
  is_veg             = excluded.is_veg,
  rating             = excluded.rating,
  review_count       = excluded.review_count,
  description        = excluded.description,
  image              = excluded.image,
  stock              = excluded.stock,
  initial_stock      = excluded.initial_stock,
  daily_limit        = excluded.daily_limit,
  tags               = excluded.tags,
  badge              = excluded.badge,
  counter            = excluded.counter,
  is_active          = excluded.is_active;

insert into public.kitchen_settings (
  singleton, max_kitchen_capacity, rush_multiplier, batching_threshold, auto_batching_enabled,
  canteen_open, w_pickup_urgency, w_prep_time, w_priority, auto_accept, demo_mode
) values (true, 12, 1.25, 2, true, true, 1, 1, 1, false, true)
on conflict (singleton) do update set
  max_kitchen_capacity   = excluded.max_kitchen_capacity,
  rush_multiplier        = excluded.rush_multiplier,
  batching_threshold     = excluded.batching_threshold,
  auto_batching_enabled  = excluded.auto_batching_enabled,
  canteen_open           = excluded.canteen_open,
  w_pickup_urgency       = excluded.w_pickup_urgency,
  w_prep_time            = excluded.w_prep_time,
  w_priority             = excluded.w_priority,
  auto_accept            = excluded.auto_accept,
  demo_mode              = excluded.demo_mode;
