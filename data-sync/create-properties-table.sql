-- Crear tabla de propiedades/apartamentos
CREATE TABLE IF NOT EXISTS "Properties" (
  id SERIAL PRIMARY KEY,
  property_id VARCHAR(50) UNIQUE NOT NULL,
  property_name VARCHAR(100) NOT NULL,
  room_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar las propiedades conocidas
INSERT INTO "Properties" (property_id, property_name) VALUES
  ('173207', '2005-A'),
  ('173307', '1820'),
  ('173308', '1317'),
  ('173309', '1722-B'),
  ('173311', '2005-B'),
  ('173312', '1722-A'),
  ('240061', '0715'),
  ('280243', 'punta arena tierra bomba')
ON CONFLICT (property_id) DO UPDATE 
SET property_name = EXCLUDED.property_name,
    updated_at = CURRENT_TIMESTAMP;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_properties_property_id ON "Properties"(property_id);