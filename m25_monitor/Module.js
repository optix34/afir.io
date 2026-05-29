/**
 * M25 Monitor - PILOT Extension (без левой панели)
 * Кнопка в хедере → открывает окно со списком M25 устройств.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // === СПИСОК M25 УСТРОЙСТВ (vehid) ПО УМОЛЧАНИЮ ===
    defaultList: [79707],  // добавьте другие vehid через запятую

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule (без боковой панели)');

        if (!window.skeleton || !skeleton.header) {
            console.error('M25 Monitor: skeleton.header not found');
            return;
        }

        // Загружаем список M25 из localStorage
        me.loadM25List();

        // Создаём кнопку в хедере
        me.headerButton = skeleton.header.insert(5, {
            xtype: 'button',
            cls: 'header_tool m25_monitor-header-btn',
            iconCls: 'fa fa-microchip',
            text: 'M25 Monitor',
            tooltip: 'Открыть окно монитора M25',
            handler: function() {
                me.openWindow();
            },
            scope: me
        });

        // Добавляем CSS для кнопки (чтобы была видна)
        me.addButtonStyles();
    },

    addButtonStyles: function() {
        if (document.getElementById('m25-monitor-styles')) return;
        var style = document.createElement('style');
        style.id = 'm25-monitor-styles';
        style.textContent = `
            .m25_monitor-header-btn {
                background: #2563eb !important;
                border-color: #1d4ed8 !important;
                margin: 0 4px !important;
            }
            .m25_monitor-header-btn .x-btn-inner,
            .m25_monitor-header-btn .x-btn-icon-el {
                color: #ffffff !important;
            }
            .m25_monitor-header-btn:hover {
                background: #1d4ed8 !important;
            }
        `;
        document.head.appendChild(style);
    },

    loadM25List: function() {
        var stored = localStorage.getItem('m25_monitor_list');
        if (stored) {
            this.m25List = Ext.decode(stored);
        } else {
            this.m25List = Ext.Array.clone(this.defaultList);
            this.saveM25List();
        }
        console.log('M25 Monitor: loaded list', this.m25List);
    },

    saveM25List: function() {
        localStorage.setItem('m25_monitor_list', Ext.encode(this.m25List));
        console.log('M25 Monitor: saved list', this.m25List);
    },

    openWindow: function() {
        if (this.window && !this.window.isDestroyed) {
            this.window.show();
            return;
        }

        var me = this;

        // Создаём дерево устройств
        var treePanel = me.createTreePanel();
        me.treePanel = treePanel;

        // Панель с тулбаром и деревом
        var mainContent = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            border: false,
            items: [
                {
                    region: 'north',
                    xtype: 'toolbar',
                    items: [
                        {
                            text: 'Добавить M25',
                            iconCls: 'fa fa-plus',
                            handler: me.promptAddVehicle,
                            scope: me
                        },
                        {
                            text: 'Удалить',
                            iconCls: 'fa fa-trash',
                            handler: me.promptRemoveVehicle,
                            scope: me
                        },
                        '->',
                        {
                            text: 'Обновить список',
                            iconCls: 'fa fa-refresh',
                            handler: me.refreshTree,
                            scope: me
                        }
                    ]
                },
                {
                    region: 'west',
                    width: 400,
                    split: true,
                    title: 'M25 Устройства',
                    layout: 'fit',
                    items: treePanel
                },
                {
                    region: 'center',
                    layout: 'fit',
                    items: me.createIframePanel()
                }
            ]
        });

        me.window = Ext.create('Ext.window.Window', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            width: 1200,
            height: 700,
            minWidth: 800,
            minHeight: 500,
            layout: 'fit',
            items: [mainContent],
            closeAction: 'hide',  // не уничтожаем, а прячем
            closable: true,
            resizable: true,
            maximizable: true,
            defaults: { border: false }
        });

        me.window.show();
    },

    createTreePanel: function() {
        var me = this;

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: 'M25 Devices',
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
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2 },
                { text: 'IMEI', dataIndex: 'imei', flex: 1, renderer: function(v) { return v || '—'; } },
                { text: 'vehid', dataIndex: 'vehid', flex: 1 }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length && selected[0].get('type') === 'veh') {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') me.onVehicleSelected(record);
                },
                scope: me
            }
        });

        me.loadM25Data(store, treePanel);
        return treePanel;
    },

    createIframePanel: function() {
        var me = this;
        var iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() { return this.getEl().dom; }
        });
        me.currentIframe = iframe;
        return iframe;
    },

    loadM25Data: function(store, treePanel) {
        var me = this;
        if (!me.m25List || me.m25List.length === 0) {
            store.setRoot({ children: [{ text: 'Нет M25 устройств. Нажмите "Добавить"', leaf: true }] });
            if (treePanel.getView()) treePanel.getView().refresh();
            return;
        }

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var vehicles = resp.objects || resp.data || resp;
                    if (!Ext.isArray(vehicles)) vehicles = [];

                    var filtered = [];
                    Ext.Array.each(vehicles, function(veh) {
                        var vehid = veh.vehid || veh.id;
                        if (Ext.Array.contains(me.m25List, vehid)) {
                            filtered.push(me.normalizeVehicleNode(veh));
                        }
                    });

                    var treeData = [{ text: 'M25 Devices', expanded: true, children: filtered }];
                    store.setRoot({ children: treeData });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();
                } catch (e) {
                    console.error(e);
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список устройств');
            }
        });
    },

    normalizeVehicleNode: function(vehicle) {
        return {
            id: 'veh_' + (vehicle.vehid || vehicle.id),
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehicle.vehid || vehicle.id,
            imei: vehicle.imei || '',
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    promptAddVehicle: function() {
        var me = this;
        Ext.Msg.prompt('Добавить устройство M25', 'Введите vehid (Agent ID) или IMEI:', function(btn, text) {
            if (btn === 'ok' && text) {
                me.findAndAddVehicle(text.trim());
            }
        });
    },

    findAndAddVehicle: function(searchValue) {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                var resp = Ext.decode(response.responseText);
                var vehicles = resp.objects || resp.data || resp;
                if (!Ext.isArray(vehicles)) vehicles = [];
                var found = null;
                Ext.Array.each(vehicles, function(veh) {
                    var vehid = veh.vehid || veh.id;
                    var imei = veh.imei || '';
                    if (vehid == searchValue || imei == searchValue) {
                        found = veh;
                        return false;
                    }
                });
                if (found) {
                    var vehid = found.vehid || found.id;
                    if (Ext.Array.contains(me.m25List, vehid)) {
                        Ext.Msg.alert('Уже есть', 'Устройство уже в списке M25');
                    } else {
                        me.m25List.push(vehid);
                        me.saveM25List();
                        me.refreshTree();
                        Ext.Msg.alert('Добавлено', 'Устройство добавлено');
                    }
                } else {
                    Ext.Msg.alert('Не найдено', 'Устройство не найдено в PILOT');
                }
            }
        });
    },

    promptRemoveVehicle: function() {
        var me = this;
        var listStr = me.m25List.join(', ');
        Ext.Msg.prompt('Удалить устройство M25', 'Текущий список: ' + listStr + '\nВведите vehid для удаления:', function(btn, text) {
            if (btn === 'ok' && text) {
                var vehid = parseInt(text, 10);
                if (isNaN(vehid)) {
                    Ext.Msg.alert('Ошибка', 'Введите числовой vehid');
                    return;
                }
                var index = Ext.Array.indexOf(me.m25List, vehid);
                if (index !== -1) {
                    me.m25List.splice(index, 1);
                    me.saveM25List();
                    me.refreshTree();
                    Ext.Msg.alert('Удалено', 'Устройство удалено');
                } else {
                    Ext.Msg.alert('Не найдено', 'Такого vehid нет в списке');
                }
            }
        });
    },

    refreshTree: function() {
        var me = this;
        if (me.treePanel && me.treePanel.getStore()) {
            me.loadM25Data(me.treePanel.getStore(), me.treePanel);
        }
    },

    onVehicleSelected: function(record) {
        var me = this;
        if (!me.currentIframe) return;

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl + (vehid ? '?vehicle_id=' + encodeURIComponent(vehid) : '');

        var iframeDom = me.currentIframe.getIframeDom();
        if (iframeDom) iframeDom.src = url;

        // Опционально: обновить заголовок окна
        if (me.window) {
            me.window.setTitle('M25 Monitor — ' + vehicleName);
        }
    }
});
