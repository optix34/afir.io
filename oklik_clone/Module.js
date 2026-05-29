Ext.define('Store.oklik_clone.Module', {
    extend: 'Ext.Component',

    initModule: function () {
        var me = this;

        // 1. Модель Task
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
                { name: 'deadline', type: 'date', dateFormat: 'Y-m-d' },
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

        // 2. Хранилище задач
        Ext.define('Store.oklik_clone.store.Tasks', {
            extend: 'Ext.data.Store',
            model: 'Store.oklik_clone.model.Task',
            autoLoad: true,
            pageSize: 25,
            remoteSort: true,
            remoteFilter: true
        });

        // 3. Форма (окно) для создания/редактирования задачи
        Ext.define('Store.oklik_clone.view.task.Form', {
            extend: 'Ext.window.Window',
            alias: 'widget.oklik_task_form',
            title: l('Новая задача'),
            layout: 'fit',
            width: 550,
            modal: true,
            items: [{
                xtype: 'form',
                bodyPadding: 10,
                items: [{
                    xtype: 'textfield',
                    name: 'title',
                    fieldLabel: l('Тема'),
                    allowBlank: false,
                    anchor: '100%'
                }, {
                    xtype: 'textfield',
                    name: 'client',
                    fieldLabel: l('Клиент'),
                    allowBlank: false,
                    anchor: '100%'
                }, {
                    xtype: 'textarea',
                    name: 'description',
                    fieldLabel: l('Описание'),
                    anchor: '100%',
                    height: 100
                }, {
                    xtype: 'textfield',
                    name: 'assigned_to',
                    fieldLabel: l('Ответственный'),
                    allowBlank: false,
                    anchor: '100%'
                }, {
                    xtype: 'combo',
                    name: 'status',
                    fieldLabel: l('Статус'),
                    store: [['new','Новая'],['in_progress','В работе'],['done','Решённая'],['closed','Закрытая']],
                    value: 'new',
                    editable: false,
                    anchor: '100%'
                }, {
                    xtype: 'combo',
                    name: 'priority',
                    fieldLabel: l('Приоритет'),
                    store: [['low','Низкий'],['medium','Средний'],['high','Высокий']],
                    value: 'low',
                    editable: false,
                    anchor: '100%'
                }, {
                    xtype: 'datefield',
                    name: 'deadline',
                    fieldLabel: l('Срок'),
                    format: 'Y-m-d',
                    anchor: '100%'
                }]
            }],
            buttons: [{
                text: l('Сохранить'),
                handler: me.onSaveTask,
                scope: me
            }, {
                text: l('Отмена'),
                handler: function(btn) { btn.up('window').close(); }
            }],
            getRecord: function() { return this.record; },
            setRecord: function(rec) { this.record = rec; },
            loadRecord: function(rec) {
                this.setRecord(rec);
                this.down('form').getForm().loadRecord(rec);
            }
        });

        // 4. Список задач (таблица)
        Ext.define('Store.oklik_clone.view.task.List', {
            extend: 'Ext.grid.Panel',
            alias: 'widget.oklik_task_list',
            title: l('Задачи'),
            store: 'Store.oklik_clone.store.Tasks',
            columns: [
                { text: 'ID', dataIndex: 'id', width: 50 },
                { text: 'Тема', dataIndex: 'title', flex: 2 },
                { text: 'Клиент', dataIndex: 'client', width: 150 },
                { text: 'Ответственный', dataIndex: 'assigned_to', width: 120 },
                { text: 'Статус', dataIndex: 'status', width: 100,
                  renderer: function(v) {
                      var map = { new:'Новая', in_progress:'В работе', done:'Решённая', closed:'Закрытая' };
                      return map[v] || v;
                  }
                },
                { text: 'Приоритет', dataIndex: 'priority', width: 90,
                  renderer: function(v) {
                      var map = { low:'Низкий', medium:'Средний', high:'Высокий' };
                      return map[v] || v;
                  }
                }
            ],
            tbar: [{
                text: l('Создать задачу'),
                iconCls: 'fa fa-plus',
                handler: me.onCreateTask,
                scope: me
            }],
            bbar: {
                xtype: 'pagingtoolbar',
                displayInfo: true,
                store: 'Store.oklik_clone.store.Tasks'
            },
            listeners: {
                itemdblclick: function(grid, record) { me.onEditTask(record); },
                scope: me
            }
        });

        // 5. Главный контейнер (обёртка)
        Ext.define('Store.oklik_clone.view.Main', {
            extend: 'Ext.panel.Panel',
            alias: 'widget.oklik_main',
            layout: 'fit',
            items: [{ xtype: 'oklik_task_list' }]
        });

        // 6. Добавление вкладки в левое меню PILOT
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Управление задачами'),
            iconCls: 'fa fa-tasks',
            iconAlign: 'top',
            minimized: true,
            items: []
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            items: [{ xtype: 'oklik_main' }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        // 7. Подключение CSS (опционально)
        var cssUrl = this.getModuleBaseUrl() + 'extension.css';
        Ext.util.CSS.swapStyleSheet('oklik_clone_css', cssUrl);
    },

    getModuleBaseUrl: function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.replace('Module.js', '');
            }
        }
        return './';
    },

    // Обработчики
    onCreateTask: function() {
        Ext.create('Store.oklik_clone.view.task.Form').show();
    },

    onEditTask: function(record) {
        var win = Ext.create('Store.oklik_clone.view.task.Form', {
            title: l('Редактирование задачи')
        });
        win.loadRecord(record);
        win.show();
    },

    onSaveTask: function(btn) {
        var win = btn.up('window');
        var form = win.down('form');
        var record = win.getRecord();
        var values = form.getValues();
        var me = this;

        if (record) {
            record.set(values);
            record.save({
                success: function() {
                    Ext.data.StoreManager.lookup('Store.oklik_clone.store.Tasks').reload();
                    win.close();
                },
                failure: function() {
                    Ext.Msg.alert(l('Ошибка'), l('Не удалось сохранить задачу'));
                }
            });
        } else {
            var newTask = Ext.create('Store.oklik_clone.model.Task', values);
            newTask.save({
                success: function() {
                    Ext.data.StoreManager.lookup('Store.oklik_clone.store.Tasks').reload();
                    win.close();
                },
                failure: function() {
                    Ext.Msg.alert(l('Ошибка'), l('Не удалось создать задачу'));
                }
            });
        }
    }
});
