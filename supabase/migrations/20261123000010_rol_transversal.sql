-- Nuevo tipo de cuenta: coordinación transversal (responsabilidades del plan del centro).
-- Va en una migración propia: un valor nuevo de un enum no se puede usar en la misma transacción.
alter type public.rol_usuario add value if not exists 'transversal';
