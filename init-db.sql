-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  address       TEXT,
  role          VARCHAR(20) DEFAULT 'user',   -- 'user' | 'admin'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Restaurants ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  cuisine       VARCHAR(80),
  address       TEXT,
  rating        DECIMAL(2,1) DEFAULT 4.0,
  delivery_time VARCHAR(30),
  delivery_fee  DECIMAL(6,2) DEFAULT 0,
  min_order     DECIMAL(6,2) DEFAULT 0,
  image_url     TEXT,
  is_open       BOOLEAN DEFAULT true,
  status        VARCHAR(20) DEFAULT 'active', -- 'active' | 'inactive'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Menu Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  price         DECIMAL(8,2) NOT NULL,
  category      VARCHAR(80),
  image_url     TEXT,
  is_available  BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id),
  restaurant_id    INTEGER REFERENCES restaurants(id),
  status           VARCHAR(30) DEFAULT 'pending',
  total_amount     DECIMAL(10,2) NOT NULL,
  delivery_address TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id),
  quantity     INTEGER NOT NULL,
  unit_price   DECIMAL(8,2) NOT NULL,
  subtotal     DECIMAL(10,2) NOT NULL
);

-- ─── Seed: Admin user (password: admin1234) ───────────────────
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin', 'admin@foodrush.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
  'admin')
ON CONFLICT (email) DO NOTHING;

-- ─── Seed: Restaurants ───────────────────────────────────────
INSERT INTO restaurants (name, description, cuisine, address, rating, delivery_time, delivery_fee, min_order, image_url) VALUES
('Spice Garden',   'Authentic Indian cuisine with rich flavors',    'Indian',   '12 MG Road, Pune',        4.5, '25-35 min', 30, 150, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800'),
('Dragon Palace',  'Traditional Chinese and Pan-Asian dishes',      'Chinese',  '45 FC Road, Pune',        4.3, '30-40 min', 25, 120, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800'),
('The Burger Lab', 'Gourmet burgers crafted with love',             'American', '8 Koregaon Park, Pune',   4.7, '20-30 min', 20, 100, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
('Pizza Rustica',  'Wood-fired Italian pizzas and pasta',           'Italian',  '22 Baner Road, Pune',     4.4, '35-45 min', 35, 200, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800'),
('Sushi Zen',      'Fresh Japanese sushi and ramen',                'Japanese', '5 Viman Nagar, Pune',     4.6, '40-50 min', 50, 250, 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800');

-- ─── Seed: Menu Items ─────────────────────────────────────────
INSERT INTO menu_items (restaurant_id, name, description, price, category, image_url) VALUES
(1,'Butter Chicken','Creamy tomato-based chicken curry',320,'Main Course','https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400'),
(1,'Paneer Tikka','Grilled cottage cheese with spices',260,'Starter','https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400'),
(1,'Dal Makhani','Slow-cooked black lentils in butter',220,'Main Course','https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'),
(1,'Garlic Naan','Soft bread with garlic and butter',60,'Bread','https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400'),
(2,'Kung Pao Chicken','Spicy stir-fried chicken with peanuts',280,'Main Course','https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400'),
(2,'Dim Sum Basket','Steamed dumplings assorted',220,'Starter','https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400'),
(2,'Fried Rice','Wok-tossed rice with vegetables',180,'Rice','https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400'),
(3,'Classic Smash Burger','Double smash patty, cheddar, pickles',350,'Burgers','https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'),
(3,'Crispy Chicken Burger','Southern fried chicken, slaw, sriracha',320,'Burgers','https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400'),
(3,'Loaded Fries','Fries with cheese sauce and jalapeños',180,'Sides','https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400'),
(4,'Margherita','San Marzano tomato, mozzarella, basil',380,'Pizza','https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400'),
(4,'Pepperoni Feast','Double pepperoni, mozzarella, oregano',450,'Pizza','https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400'),
(4,'Pasta Carbonara','Spaghetti, pancetta, egg, pecorino',320,'Pasta','https://images.unsplash.com/photo-1551183053-bf91798d773c?w=400'),
(5,'Salmon Nigiri (6 pcs)','Fresh Atlantic salmon over rice',420,'Sushi','https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=400'),
(5,'Dragon Roll','Shrimp tempura, avocado, eel sauce',520,'Rolls','https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400'),
(5,'Tonkotsu Ramen','Rich pork broth, chashu, soft egg',380,'Ramen','https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400');
