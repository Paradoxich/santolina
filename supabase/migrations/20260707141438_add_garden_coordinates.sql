-- Needed for weather/climate lookups (Open-Meteo requires lat/lon, not just city name)
alter table public.gardens
  add column lat double precision,
  add column lon double precision;
comment on column public.gardens.lat is 'Latitude, from geocoding the garden city — required for weather/climate API calls';
comment on column public.gardens.lon is 'Longitude, from geocoding the garden city — required for weather/climate API calls';
