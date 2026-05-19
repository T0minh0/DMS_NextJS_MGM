-- Update level definitions with Portuguese translations
UPDATE "level_definition" SET "level_name" = 'Iniciante' WHERE "level_number" = 1;
UPDATE "level_definition" SET "level_name" = 'Amador' WHERE "level_number" = 2;
UPDATE "level_definition" SET "level_name" = 'Aprendiz' WHERE "level_number" = 3;
UPDATE "level_definition" SET "level_name" = 'Coletor' WHERE "level_number" = 4;
UPDATE "level_definition" SET "level_name" = 'Profissional' WHERE "level_number" = 5;
UPDATE "level_definition" SET "level_name" = 'Especialista' WHERE "level_number" = 6;
UPDATE "level_definition" SET "level_name" = 'Mestre' WHERE "level_number" = 7;
UPDATE "level_definition" SET "level_name" = 'Elite' WHERE "level_number" = 8;
UPDATE "level_definition" SET "level_name" = 'Campeão' WHERE "level_number" = 9;
UPDATE "level_definition" SET "level_name" = 'Lenda' WHERE "level_number" = 10;

-- Update achievement definitions with Portuguese translations
UPDATE "achievement_definition" SET "achievement_name" = 'Iniciante', "description" = 'Coletar 50 kg de materiais em um mês' WHERE "achievement_key" = 'WEIGHT_50KG';
UPDATE "achievement_definition" SET "achievement_name" = 'Amador', "description" = 'Coletar 100 kg of materiais em um mês' WHERE "achievement_key" = 'WEIGHT_100KG';
UPDATE "achievement_definition" SET "achievement_name" = 'Profissional', "description" = 'Coletar 250 kg de materiais em um mês' WHERE "achievement_key" = 'WEIGHT_250KG';
UPDATE "achievement_definition" SET "achievement_name" = 'Mestre Coletor', "description" = 'Coletar 500 kg de materiais em um mês' WHERE "achievement_key" = 'WEIGHT_500KG';
UPDATE "achievement_definition" SET "achievement_name" = 'Coletor Lendário', "description" = 'Coletar 1000 kg de materiais em um mês' WHERE "achievement_key" = 'WEIGHT_1000KG';

UPDATE "achievement_definition" SET "achievement_name" = 'Primeiros Passos', "description" = 'Trabalhar pelo menos 5 dias em um mês' WHERE "achievement_key" = 'DAYS_5';
UPDATE "achievement_definition" SET "achievement_name" = 'Em Ritmo Firme', "description" = 'Trabalhar pelo menos 10 dias em um mês' WHERE "achievement_key" = 'DAYS_10';
UPDATE "achievement_definition" SET "achievement_name" = 'Trabalhador Comprometido', "description" = 'Trabalhar pelo menos 15 dias em um mês' WHERE "achievement_key" = 'DAYS_15';
UPDATE "achievement_definition" SET "achievement_name" = 'Trabalhador Dedicado', "description" = 'Trabalhar pelo menos 20 dias em um mês' WHERE "achievement_key" = 'DAYS_20';
UPDATE "achievement_definition" SET "achievement_name" = 'Trabalhador Imparável', "description" = 'Trabalhar pelo menos 25 dias em um mês' WHERE "achievement_key" = 'DAYS_25';

UPDATE "achievement_definition" SET "achievement_name" = 'Estrela Ascendente', "description" = 'Desbloquear 3 conquistas diferentes em um mês' WHERE "achievement_key" = 'ACHIEVEMENTS_COUNT_3';
UPDATE "achievement_definition" SET "achievement_name" = 'Estrela Brilhante', "description" = 'Desbloquear 5 conquistas diferentes em um mês' WHERE "achievement_key" = 'ACHIEVEMENTS_COUNT_5';
UPDATE "achievement_definition" SET "achievement_name" = 'Superestrela', "description" = 'Desbloquear 8 conquistas diferentes em um mês' WHERE "achievement_key" = 'ACHIEVEMENTS_COUNT_8';
UPDATE "achievement_definition" SET "achievement_name" = 'Superestrela Lendária', "description" = 'Desbloquear 10 conquistas diferentes em um mês' WHERE "achievement_key" = 'ACHIEVEMENTS_COUNT_10';
