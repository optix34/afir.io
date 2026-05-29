Ext.define('Store.oklik_clone.view.task.List', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.oklik_task_list',
    title: l('Задачи'),
    store: 'Tasks',
    columns: [{
        text: 'ID',
        dataIndex: 'id',
        width: 50
    }, {
        text: 'Тема',
        dataIndex: 'title',
        flex: 2
    }, {
        text: 'Клиент',
        dataIndex: 'client',
        width: 150
    }, {
        text: 'Ответственный',
        dataIndex: 'assigned_to',
        width: 120
    }, {
        text: 'Статус',
        dataIndex: 'status',
        width: 100,
        renderer: function(v) {
            var map = { new: 'Новая', in_progress: 'В работе', done: 'Решённая', closed: 'Закрытая' };
            return map[v] || v;
        }
    }, {
        text: 'Приоритет',
        dataIndex: 'priority',
        width: 90,
        renderer: function(v) {
            var map = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
            return map[v] || v;
        }
    }],
    tbar: [{
        text: l('Создать задачу'),
        iconCls: 'fa fa-plus',
        handler: 'onCreateTask'
    }],
    bbar: {
        xtype: 'pagingtoolbar',
        displayInfo: true,
        store: 'Tasks'
    },
    listeners: {
        itemdblclick: 'onEditTask'
    }
});
