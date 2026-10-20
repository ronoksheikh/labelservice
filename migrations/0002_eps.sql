-- EPS payments: our merchantTransactionId (sent to EPS, used to verify) and the wallet/card the buyer paid with.
ALTER TABLE orders ADD COLUMN payment_txn TEXT;
ALTER TABLE orders ADD COLUMN payment_method TEXT;
CREATE UNIQUE INDEX orders_payment_txn ON orders (payment_txn) WHERE payment_txn IS NOT NULL;
