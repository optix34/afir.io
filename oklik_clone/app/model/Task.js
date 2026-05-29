Ext.define('Store.oklik_clone.model.Task', {
    extend: 'Ext.data.Model',
    fields: [
        { name: 'id', type: 'int' },
        { name: 'title', type: 'string' },
        { name: 'client', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'assigned_to', type: 'string' },
        { name: 'status', type: 'string', defaultValue: 'new' },
        { name: 'priority', type: 'string', defaultValue: 'low' },
        { name: 'created_at', type: 'date', dateFormat: 'c' },
        { name: 'updated_at', type: 'date', dateFormat: 'c' },
        { name: 'deadline', type: 'date', dateFormat: 'c' },
        { name: 'payment_status', type: 'string', defaultValue: 'none' },
        { name: 'payment_amount', type: 'float' }
    ],
    proxy: {
        type: 'ajax',
        api: {
            create: '/store/oklik_clone/backend/api.php?action=create_task',
            read: '/store/oklik_clone/backend/api.php?action=get_tasks',
            update: '/store/oklik_clone/backend/api.php?action=update_task',
            destroy: '/store/oklik_clone/backend/api.php?action=delete_task'
        },
        reader: {
            type: 'json',
            rootProperty: 'data'
        },
        writer: {
            type: 'json',
            writeAllFields: true
        }
    }
});
