-- E8: reemplazo de los 2 vídeos en inglés del catálogo por versiones en
-- español (CuídatePlus - audio en español, embebibilidad verificada con
-- yt-dlp: existente + playable_in_embed). Aplicación única vía runner.
-- Bird dog: FMS (en) -> CuídatePlus Rn0SFzJzhQc
-- Farmer carry: Denvyr (en) -> CuídatePlus X5ZRWP_AHPw
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=Rn0SFzJzhQc' WHERE name = 'Bird dog';
UPDATE exercises SET technique_url = 'https://www.youtube.com/watch?v=X5ZRWP_AHPw' WHERE name = 'Farmer carry';
