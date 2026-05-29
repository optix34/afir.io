/**
 * M25 Monitor - PILOT Extension
 * Ручное управление списком M25 устройств.
 * Сохраняет список vehid в localStorage.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // === ЗДЕСЬ ЗАДАЙТЕ ИЗВЕСТНЫЕ M25 УСТРОЙСТВА (vehid) ===
    defaultList: [79707],  // добавьте другие vehid через запятую, например [79707, 12345, 67890]

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton not ready');
            return;
        }

        // Инициализируем список (загружаем из localStorage или используем defaultList)
        me.loadM25List();

        // Левая панель с кнопками и деревом
        var navPanel = Ext.create('Ext.panel.Panel', {
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
                    region: 'center',
                    xtype: 'panel',
                    layout: 'fit',
                    items: me.createTreePanel()
                }
            ]
        });

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navPanel]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        me.navTab = navTab;
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

    promptAddVehicle: function() {
        var me = this;
        Ext.Msg.prompt('Добавить устройство M25', 'Введите vehid (Agent ID) или IMEI устройства:', function(btn, text) {
            if (btn === 'ok' && text) {
                var value = text.trim();
                me.findAndAddVehicle(value);
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
                        Ext.Msg.alert('Добавлено', 'Устройство добавлено в список M25');
                    }
                } else {
                    Ext.Msg.alert('Не найдено', 'Устройство с таким vehid или IMEI не найдено в PILOT');
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список устройств');
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
                    Ext.Msg.alert('Удалено', 'Устройство удалено из списка M25');
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
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2, sortable: true },
                { text: 'IMEI', dataIndex: 'imei', flex: 1, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: 'vehid', dataIndex: 'vehid', flex: 1, sortable: true }
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
        me.treePanel = treePanel;
        return treePanel;
    },

    loadM25Data: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: loading data, filtering by list', me.m25List);

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

                    console.log('M25 Monitor: found', filtered.length, 'matching vehicles');
                    var treeData = [{
                        text: 'M25 Devices',
                        expanded: true,
                        children: filtered
                    }];
                    store.setRoot({ children: treeData });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();
                } catch (e) {
                    console.error('M25 Monitor: error', e);
                    Ext.Msg.alert('Ошибка', 'Ошибка загрузки данных');
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
                    text: 'Обновить',
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
                    html: '<span style="color:#888;">Выберите объект в левой панели</span>',
                    itemId: 'infoText'
                }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: 'M25 Monitor — внешняя страница',
            tbar: toolbar,
            items: [iframe]
        });

        mainPanel.iframe = iframe;
        me.currentIframeSrc = 'about:blank';
        return mainPanel;
    },

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
            infoText.update('<span style="color:#2563eb;">Текущий объект: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('M25 Monitor: selected', vehicleName, vehid);
    }
});
