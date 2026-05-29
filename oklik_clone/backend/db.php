<?php
$db = new PDO('sqlite:' . __DIR__ . '/tasks.db');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    client TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    priority TEXT DEFAULT 'low',
    created_at DATETIME,
    updated_at DATETIME,
    deadline DATE,
    payment_status TEXT DEFAULT 'none',
    payment_amount REAL DEFAULT 0
)");
