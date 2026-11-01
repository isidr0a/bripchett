CREATE TABLE bootstrap_lock(id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TABLE visit_completions(visit_id TEXT PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE, result TEXT NOT NULL CHECK(result IN('con_pedido','sin_pedido')));
CREATE TRIGGER last_admin BEFORE UPDATE OF role,active,banned ON user
WHEN old.role='administracion' AND old.active=1 AND coalesce(old.banned,0)=0 AND (new.role<>'administracion' OR new.active=0 OR coalesce(new.banned,0)=1)
BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM user WHERE id<>old.id AND role='administracion' AND active=1 AND coalesce(banned,0)=0) THEN RAISE(ABORT,'LAST_ADMIN') END; END;
CREATE TRIGGER order_product_guard BEFORE INSERT ON order_items BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=new.product_id AND active=1 AND CAST(price_usd AS REAL)=CAST(new.price_usd AS REAL)) THEN RAISE(ABORT,'PRODUCT_CHANGED') END; END;
CREATE TRIGGER visit_scope BEFORE INSERT ON visits BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM clients c JOIN user u ON u.id=new.seller_id WHERE c.id=new.client_id AND c.active=1 AND c.seller_id=new.seller_id AND u.role='vendedor' AND u.active=1 AND coalesce(u.banned,0)=0) THEN RAISE(ABORT,'VISIT_CLIENT_SCOPE') END; END;
CREATE TRIGGER route_edit_guard BEFORE UPDATE ON routes BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM visits WHERE route_id=old.id AND status<>'programada') THEN RAISE(ABORT,'ROUTE_STARTED') END; END;
