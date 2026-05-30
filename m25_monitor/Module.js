/**
 * Устройства клиента — расширение PILOT в стиле вкладки Online.
 * Показывает иерархическое дерево объектов (группы + ТС).
 * Для каждого ТС можно задать/изменить тип устройства через контекстное меню.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Предопределённые типы
    deviceTypeOptions: ['M25', 'M30', 'M40', 'Другое'],

    initModule: function() {
        var me = this;
        console.log('DeviceMonitor: initModule');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('DeviceMonitor: skeleton not ready');
            return;
        }

        // Загружаем сохранённые типы
        me.loadSavedTypes();

        // Создаём дерево
        var treePanel = me.createTreePanel();

        // Вкладка в левой навигации — только дерево, без дополнительных панелей
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'Устройства клиента',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [treePanel]
        });

        // Основная панель (iframe)
        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.treePanel = treePanel;
        me.mainPanel = mainPanel;
    },

    // Загрузка сохранённых типов из localStorage
    loadSavedTypes: function() {
        var stored = localStorage.getItem('device_custom_types');
        if (stored) {
            this.customTypes = Ext.decode(stored);
        } else {
            this.customTypes = {};
        }
    },

    // Сохранение всех типов в localStorage
    saveAllTypes: function() {
        localStorage.setItem('device_custom_types', Ext.encode(this.customTypes));
        Ext.Msg.alert('Сохранено', 'Типы устройств сохранены');
    },

    // Сброс всех пользовательских типов
    resetAllTypes: function() {
        var me = this;
        Ext.Msg.confirm('Сброс', 'Сбросить все типы к значениям из системы?', function(btn) {
            if (btn === 'yes') {
                me.customTypes = {};
                me.saveAllTypes();
                me.refreshTree();
            }
        });
    },

    // Обновить дерево из API
    refreshTree: function() {
        var me = this;
        if (me.treePanel && me.treePanel.getStore()) {
            me.loadTreeData(me.treePanel.getStore(), me.treePanel);
        }
    },

    // Создание дерева с колонками
    createTreePanel: function() {
        var me = this;

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: 'Все объекты',
                expanded: true,
                children: []
            },
            sorters: [{ property: 'text', direction: 'ASC' }]
        });

        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2, sortable: true },
                { text: 'ID устройства (vehid)', dataIndex: 'vehid', flex: 1, sortable: true },
                { text: 'Тип устройства', dataIndex: 'deviceType', flex: 1.5, sortable: true }
            ],
            listeners: {
                // Левый клик — выбор объекта
                selectionchange: function(sm, selected) {
                    if (selected && selected.length && selected[0].get('type') === 'veh') {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                // Контекстное меню для ТС
                itemcontextmenu: function(view, record, item, index, event) {
                    event.stopEvent();
                    if (record.get('type') === 'veh') {
                        me.showContextMenu(record, event);
                    }
                },
                scope: me
            }
        });

        me.loadTreeData(store, treePanel);
        return treePanel;
    },

    // Загрузка иерархических данных из tags.php
    loadTreeData: function(store, treePanel) {
        var me = this;
        console.log('DeviceMonitor: загрузка дерева из /ax/mod/tags.php?cmd=groups');

        Ext.Ajax.request({
            url: '/ax/mod/tags.php',
            params: {
                cmd: 'groups',
                _dc: new Date().getTime(),
                page: 1,
                start: 0,
                limit: 1000
            },
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var groups = resp.data || resp;
                    if (!Ext.isArray(groups)) groups = [groups];

                    // Рекурсивно обрабатываем дерево
                    var processed = me.processTreeNodes(groups);
                    store.setRoot({ children: processed });
                    if (treePanel.getView()) treePanel.getView().refresh();

                } catch (e) {
                    console.error('DeviceMonitor: ошибка', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось загрузить дерево объектов');
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Ошибка соединения с PILOT API');
            }
        });
    },

    // Рекурсивная обработка узлов дерева (группы и ТС)
    processTreeNodes: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            if (isVehicle) {
                var vehid = node.vehid || node.id;
                if (vehid) {
                    result.push(me.normalizeVehicleNode(node, vehid));
                }
            } else {
                // Группа/папка
                var children = node.children || [];
                var processedChildren = me.processTreeNodes(children);
                result.push({
                    id: node.id || Ext.id(),
                    text: node.text || node.name || 'Папка',
                    type: 'group',
                    leaf: false,
                    expanded: false,
                    children: processedChildren
                });
            }
        });
        return result;
    },

    // Нормализация узла ТС с учётом сохранённого типа
    normalizeVehicleNode: function(vehicle, vehid) {
        var savedType = this.customTypes[vehid];
        var apiType = vehicle.model || vehicle.equipment || vehicle.hardware || vehicle.device_type || '';
        var displayType = savedType;
        if (!displayType && apiType && this.deviceTypeOptions.indexOf(apiType) !== -1) {
            displayType = apiType;
        }
        return {
            id: 'veh_' + vehid,
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehid,
            deviceType: displayType || '',
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car',
            rawApiType: apiType   // для сброса
        };
    },

    // Контекстное меню для ТС
    showContextMenu: function(record, event) {
        var me = this;
        var vehid = record.get('vehid');
        var currentType = record.get('deviceType');

        var menu = Ext.create('Ext.menu.Menu', {
            items: [
                {
                    text: 'Изменить тип устройства...',
                    iconCls: 'fa fa-pencil',
                    handler: function() {
                        me.promptChangeType(record, vehid, currentType);
                    }
                },
                {
                    text: 'Сбросить тип (к системному)',
                    iconCls: 'fa fa-undo',
                    handler: function() {
                        delete me.customTypes[vehid];
                        record.set('deviceType', record.get('rawApiType') || '');
                        me.saveAllTypes();
                    }
                },
                '-',
                {
                    text: 'Сохранить все типы',
                    iconCls: 'fa fa-save',
                    handler: function() {
                        me.saveAllTypes();
                    }
                },
                {
                    text: 'Сбросить все типы',
                    iconCls: 'fa fa-trash',
                    handler: function() {
                        me.resetAllTypes();
                    }
                },
                '-',
                {
                    text: 'Обновить список',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        me.refreshTree();
                    }
                }
            ]
        });
        menu.showAt(event.getXY());
    },

    // Диалог изменения типа
    promptChangeType: function(record, vehid, currentType) {
        var me = this;
        var comboBox = Ext.create('Ext.form.field.ComboBox', {
            store: this.deviceTypeOptions,
            queryMode: 'local',
            editable: true,
            forceSelection: false,
            triggerAction: 'all',
            value: currentType || '',
            fieldLabel: 'Тип устройства',
            width: 300
        });

        var win = Ext.create('Ext.window.Window', {
            title: 'Изменить тип',
            modal: true,
            items: [comboBox],
            buttons: [
                {
                    text: 'OK',
                    handler: function() {
                        var newType = comboBox.getValue();
                        if (newType) {
                            me.customTypes[vehid] = newType;
                            record.set('deviceType', newType);
                            me.saveAllTypes(); // автосохранение
                        } else {
                            // пустое значение — удаляем пользовательский тип
                            delete me.customTypes[vehid];
                            record.set('deviceType', record.get('rawApiType') || '');
                            me.saveAllTypes();
                        }
                        win.close();
                    }
                },
                {
                    text: 'Отмена',
                    handler: function() { win.close(); }
                }
            ]
        });
        win.show();
    },

    // Создание правой панели с iframe
    createMainPanel: function() {
        var me = this;

        var iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() { return this.getEl().dom; }
        });

        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: 'Обновить iframe',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            var iframeEl = iframe.getIframeDom();
                            if (iframeEl) iframeEl.src = me.currentIframeSrc;
                        }
                    }
                },
                {
                    text: 'Открыть в новом окне',
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert('Информация', 'Сначала выберите объект.');
                        }
                    }
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#888;">Выберите устройство в левой панели</span>',
                    itemId: 'infoText'
                }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: 'Информация об устройстве',
            tbar: toolbar,
            items: [iframe]
        });

        mainPanel.iframe = iframe;
        me.currentIframeSrc = 'about:blank';
        return mainPanel;
    },

    // Обработчик выбора устройства
    onVehicleSelected: function(record) {
        var me = this;
        var mainPanel = me.mainPanel;
        if (!mainPanel) return;

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;
        if (vehid) {
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        var iframeDom = mainPanel.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = url;
            me.currentIframeSrc = url;
        }

        var infoText = mainPanel.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">Текущее устройство: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('DeviceMonitor: выбрано', vehicleName, vehid);
    }
});
