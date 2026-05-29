Ext.define('Store.oklik_clone.controller.Tasks', {
    extend: 'Ext.app.Controller',
    views: ['task.List', 'task.Form', 'task.Card'],
    stores: ['Tasks'],
    models: ['Task'],

    refs: [{
        ref: 'taskList',
        selector: 'oklik_task_list'
    }],

    init: function() {
        this.control({
            'oklik_task_list button[action=create]': { click: this.onCreateTask },
            'oklik_task_list': { itemdblclick: this.onEditTask },
            'oklik_task_form button[action=save]': { click: this.onSaveTask },
            'oklik_task_form button[action=cancel]': { click: this.onCancelTask }
        });
    },

    onCreateTask: function() {
        var view = Ext.create('Store.oklik_clone.view.task.Form');
        view.show();
    },

    onEditTask: function(grid, record) {
        var view = Ext.create('Store.oklik_clone.view.task.Form', {
            title: l('Редактирование задачи')
        });
        view.loadRecord(record);
        view.show();
    },

    onSaveTask: function(btn) {
        var form = btn.up('form');
        var record = form.getRecord();
        var values = form.getValues();
        var me = this;

        if (record) {
            record.set(values);
            record.save({
                success: function() {
                    me.getTaskList().getStore().reload();
                    form.close();
                },
                failure: function() {
                    Ext.Msg.alert(l('Ошибка'), l('Не удалось сохранить задачу'));
                }
            });
        } else {
            var newTask = Ext.create('Store.oklik_clone.model.Task', values);
            newTask.save({
                success: function() {
                    me.getTaskList().getStore().reload();
                    form.close();
                },
                failure: function() {
                    Ext.Msg.alert(l('Ошибка'), l('Не удалось создать задачу'));
                }
            });
        }
    },

    onCancelTask: function(btn) {
        btn.up('form').close();
    }
});
