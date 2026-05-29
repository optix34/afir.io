/**
 * M25 Monitor - PILOT Extension
 * Отображает все устройства клиента с возможностью редактирования типа оборудования.
 * Типы сохраняются в localStorage.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton not ready');
            return;
        }

        // Хранилище для типов оборудования
        me.loadDeviceTypes();

        // Левая панель с тулбаром и деревом
        var navPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            border: false,
            items: [
                {
                    region: 'north',
                    xtype: 'toolbar',
                    items: [
                        {
                            text: 'Сохранить типы',
                            iconCls: 'fa fa-save',
                            handler: me.saveDeviceTypesToLocal,
                            scope: me
                        },
                        {
                            text: 'Сбросить все типы',
                            iconCls: 'fa fa-undo',
                            handler: me.resetAllTypes,
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
            title: 'Устройства клиента',
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
    },

    // Загрузка сохранённых типов из localStorage
    loadDeviceTypes: function() {
        var stored = localStorage.getItem('m25_monitor_device_types');
        if (stored) {
            this.deviceTypes = Ext.decode(stored);
        } else {
            this.deviceTypes = {};
        }
    },

    // Сохранение типов в localStorage (вызывается вручную или автоматически)
    saveDeviceTypesToLocal: function() {
        localStorage.setItem('m25_monitor_device_types', Ext.encode(this.deviceTypes));
        Ext.Msg.alert('Сохранено', 'Типы оборудования сохранены в браузере');
    },

    // Сброс всех типов
    resetAllTypes: function() {
        var me = this;
        Ext.Msg.confirm('Сброс', 'Удалить все сохранённые типы?', function(btn) {
            if (btn === 'yes') {
                me.deviceTypes = {};
                me.saveDeviceTypesToLocal();
                me.refreshTree();
            }
        });
    },

    // Обновить дерево
    refreshTree: function() {
        var me = this;
        if (me.treePanel && me.treePanel.getStore()) {
            me.loadAllVehicles(me.treePanel.getStore(), me.treePanel);
        }
    },

    createTreePanel: function() {
        var me = this;

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: 'Все транспортные средства',
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
                { text: 'Agent ID (vehid)', dataIndex: 'vehid', flex: 1, sortable: true },
                {
                    text: 'Тип оборудования',
                    dataIndex: 'deviceType',
                    flex: 1.5,
                    sortable: true,
                    renderer: function(value, meta, record) {
                        // Делаем ячейку редактируемой по двойному клику
                        var vehid = record.get('vehid');
                        var val = value || 'не указан';
                        return '<span class="editable-type" data-vehid="' + vehid + '" style="cursor:pointer; color:#2563eb;">' + Ext.String.htmlEncode(val) + ' ✎</span>';
                    }
                }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length && selected[0].get('type') === 'veh') {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') {
                        me.editDeviceType(record);
                    }
                },
                // Обработка клика по редактируемому полю (делегирование)
                render: function() {
                    treePanel.getEl().on('click', function(e) {
                        var target = e.getTarget('.editable-type');
                        if (target) {
                            var vehid = target.getAttribute('data-vehid');
                            var record = store.getNodeById('veh_' + vehid);
                            if (record) me.editDeviceType(record);
                        }
                    });
                },
                scope: me
            }
        });

        me.loadAllVehicles(store, treePanel);
        me.treePanel = treePanel;
        return treePanel;
    },

    // Загрузка всех устройств из API
    loadAllVehicles: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: загрузка всех устройств');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var vehicles = resp.objects || resp.data || resp;
                    if (!Ext.isArray(vehicles)) {
                        vehicles = [];
                    }

                    var nodes = [];
                    Ext.Array.each(vehicles, function(veh) {
                        var vehid = veh.vehid || veh.id;
                        if (vehid) {
                            nodes.push(me.normalizeVehicleNode(veh));
                        }
                    });

                    console.log('M25 Monitor: загружено устройств:', nodes.length);
                    var treeData = [{
                        text: 'Все транспортные средства',
                        expanded: true,
                        children: nodes
                    }];
                    store.setRoot({ children: treeData });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();
                } catch (e) {
                    console.error('M25 Monitor: ошибка', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось загрузить список устройств');
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Ошибка соединения с PILOT API');
            }
        });
    },

    // Нормализация узла с учётом сохранённого типа
    normalizeVehicleNode: function(vehicle) {
        var vehid = vehicle.vehid || vehicle.id;
        // Пытаемся определить тип из API (если есть)
        var apiType = vehicle.model || vehicle.equipment || vehicle.hardware || vehicle.device_type || '';
        // Если тип сохранён в localStorage, используем его; иначе берем из API
        var savedType = this.deviceTypes[vehid];
        var displayType = savedType || apiType || '';
        return {
            id: 'veh_' + vehid,
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehid,
            imei: vehicle.imei || '',
            deviceType: displayType,
            rawApiType: apiType, // сохраняем оригинал для сброса
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    // Редактирование типа оборудования
    editDeviceType: function(record) {
        var me = this;
        var vehid = record.get('vehid');
        var currentType = record.get('deviceType') || '';
        Ext.Msg.prompt('Редактировать тип оборудования', 'Введите тип для устройства "' + record.get('text') + '" (например, M25):', function(btn, text) {
            if (btn === 'ok' && text !== null) {
                var newType = text.trim();
                if (newType === '') {
                    // Если пусто, удаляем сохранённый тип и используем API
                    delete me.deviceTypes[vehid];
                } else {
                    me.deviceTypes[vehid] = newType;
                }
                me.saveDeviceTypesToLocal(); // автосохранение
                me.refreshTree(); // перезагружаем дерево
            }
        }, this, false, currentType);
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
            title: 'Информация об устройстве (внешняя страница)',
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
            infoText.update('<span style="color:#2563eb;">Текущее устройство: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('M25 Monitor: выбрано', vehicleName, vehid);
    }
});
