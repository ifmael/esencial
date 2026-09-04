-- Fix: "Toque de talones" apuntaba a un vídeo eliminado (oFRhXxUZYnk,
-- "This video is unavailable"). Reemplazo verificado con yt-dlp
-- (playable + playable_in_embed): Ana Checa, 43 s, en español.
-- Aplicación única vía runner (como 0006).
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=RN7LM6mcPpQ' WHERE name = 'Toque de talones';
