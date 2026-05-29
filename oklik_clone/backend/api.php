<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

$action = $_GET['action'] ?? '';

// Простая имитация данных
$mockTasks = [
    ['id' => 1, 'title' => 'Тестовая задача', 'client' => 'Клиент А', 'description' => '', 'assigned_to' => 'Иванов', 'status' => 'new', 'priority' => 'high', 'created_at' => date('c'), 'updated_at' => date('c'), 'deadline' => date('Y-m-d'), 'payment_status' => 'none', 'payment_amount' => 0],
    ['id' => 2, 'title' => 'Ещё задача', 'client' => 'Клиент Б', 'description' => '', 'assigned_to' => 'Петров', 'status' => 'in_progress', 'priority' => 'medium', 'created_at' => date('c'), 'updated_at' => date('c'), 'deadline' => date('Y-m-d', strtotime('+2 days')), 'payment_status' => 'none', 'payment_amount' => 0],
];

if ($action === 'get_tasks') {
    echo json_encode(['data' => $mockTasks, 'total' => count($mockTasks)]);
} elseif ($action === 'create_task') {
    echo json_encode(['success' => true, 'id' => 3]);
} elseif ($action === 'update_task') {
    echo json_encode(['success' => true]);
} elseif ($action === 'delete_task') {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['error' => 'Unknown action']);
}
