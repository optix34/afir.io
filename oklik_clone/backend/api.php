<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_tasks':
        $page = $_GET['page'] ?? 1;
        $limit = $_GET['limit'] ?? 25;
        $offset = ($page - 1) * $limit;
        
        $stmt = $db->prepare("SELECT * FROM tasks ORDER BY id DESC LIMIT ? OFFSET ?");
        $stmt->execute([$limit, $offset]);
        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $totalStmt = $db->query("SELECT COUNT(*) FROM tasks");
        $total = $totalStmt->fetchColumn();
        
        echo json_encode(['data' => $tasks, 'total' => $total]);
        break;
        
    case 'create_task':
        $data = json_decode(file_get_contents('php://input'), true);
        $stmt = $db->prepare("INSERT INTO tasks (title, client, description, assigned_to, status, priority, created_at, updated_at, deadline) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)");
        $stmt->execute([$data['title'], $data['client'], $data['description'], $data['assigned_to'], $data['status'], $data['priority'], $data['deadline']]);
        echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
        break;
        
    case 'update_task':
        $data = json_decode(file_get_contents('php://input'), true);
        $stmt = $db->prepare("UPDATE tasks SET title=?, client=?, description=?, assigned_to=?, status=?, priority=?, deadline=?, updated_at=datetime('now') WHERE id=?");
        $stmt->execute([$data['title'], $data['client'], $data['description'], $data['assigned_to'], $data['status'], $data['priority'], $data['deadline'], $data['id']]);
        echo json_encode(['success' => true]);
        break;
        
    case 'delete_task':
        $id = $_GET['id'] ?? 0;
        $stmt = $db->prepare("DELETE FROM tasks WHERE id=?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        break;
        
    default:
        echo json_encode(['error' => 'Unknown action']);
}
