/**
 * M25 Monitor - PILOT Extension
 * Отображает все устройства клиента.
 * ID устройства = vehid (Agent ID) – только для чтения.
 * Тип устройства автоматически определяется из полей model/equipment API,
 * но может быть изменён пользователем (сохраняется в localStorage).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Предопределённые типы устройств
    deviceTypeOptions: ['M25', 'M30', 'M40', 'Другое'],

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton not ready');
            return;
        }

        // Загружаем сохранённые типы (по vehid)
        me.loadSavedTypes();

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
                            handler: me.saveTypesToLocal,
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

    loadSavedTypes: function() {
        var stored = localStorage.getItem('m25_monitor_device_types');
        if (stored) {
            this.deviceTypes = Ext.decode(stored);
        } else {
            this.deviceTypes = {};
        }
    },

    saveTypesToLocal: function() {
        localStorage.setItem('m25_monitor_device_types', Ext.encode(this.deviceTypes));
        Ext.Msg.alert('Сохранено', 'Типы устройств сохранены');
    },

    resetAllTypes: function() {
        var me = this;
        Ext.Msg.confirm('Сброс', 'Сбросить все типы устройств к значениям из API?', function(btn) {
            if (btn === 'yes') {
                me.deviceTypes = {};
                me.saveTypesToLocal();
                me.refreshTree();
            }
        });
    },

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

        // Редактирование ячеек только для колонки "Тип устройства"
        var cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 2,
            listeners: {
                beforeedit: function(editor, context) {
                    // Разрешаем редактировать только колонку deviceType
                    return context.column.dataIndex === 'deviceType';
                },
                edit: function(editor, context) {
                    var record = context.record;
                    var newValue = context.value;
                    var vehid = record.get('vehid');
                    if (!vehid) return;

                    if (newValue) {
                        me.deviceTypes[vehid] = newValue;
                    } else {
                        delete me.deviceTypes[vehid];
                    }
                    // Обновляем запись, чтобы отобразить новое значение
                    record.set('deviceType', newValue);
                    me.saveTypesToLocal();
                }
            }
        });

        // Колонка "Тип устройства" – выпадающий список
        var typeColumn = {
            text: 'Тип устройства',
            dataIndex: 'deviceType',
            flex: 1.5,
            sortable: true,
            editor: {
                xtype: 'combobox',
                store: me.deviceTypeOptions,
                queryMode: 'local',
                editable: true,
                forceSelection: false,
                triggerAction: 'all'
            },
            renderer: function(value) {
                return value ? Ext.String.htmlEncode(value) : '—';
            }
        };

        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            selType: 'cellmodel',
            plugins: [cellEditing],
            columns: [
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2, sortable: true },
                { text: 'ID устройства (Agent ID)', dataIndex: 'vehid', flex: 1, sortable: true },
                typeColumn
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length && selected[0].get('type') === 'veh') {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                scope: me
            }
        });

        me.loadAllVehicles(store, treePanel);
        me.treePanel = treePanel;
        return treePanel;
    },

    loadAllVehicles: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: загрузка устройств из PILOT');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var vehicles = resp.objects || resp.data || resp;
                    if (!Ext.isArray(vehicles)) vehicles = [];

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

    // Нормализация узла: ID устройства = vehid, тип – из сохранённого или из API
    normalizeVehicleNode: function(vehicle) {
        var vehid = vehicle.vehid || vehicle.id;
        var savedType = this.deviceTypes[vehid];
        if (savedType !== undefined) {
            // Используем сохранённый тип
            return {
                id: 'veh_' + vehid,
                text: vehicle.text || vehicle.name || 'Без имени',
                vehid: vehid,
                deviceType: savedType,
                type: 'veh',
                leaf: true,
                iconCls: 'fa fa-car'
            };
        } else {
            // Автоматическое определение типа из полей API
            var apiType = vehicle.model || vehicle.equipment || vehicle.hardware || vehicle.device_type || '';
            // Если API тип входит в список опций, используем его, иначе пусто
            var displayType = (this.deviceTypeOptions.indexOf(apiType) !== -1) ? apiType : '';
            return {
                id: 'veh_' + vehid,
                text: vehicle.text || vehicle.name || 'Без имени',
                vehid: vehid,
                deviceType: displayType,
                type: 'veh',
                leaf: true,
                iconCls: 'fa fa-car'
            };
        }
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
