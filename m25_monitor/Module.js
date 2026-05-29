/**
 * M25 Monitor - PILOT Extension
 * Колонки: Объект, vehid (системный), ID устройства (пользовательский), Тип устройства (выбор из списка).
 * Все редактируемые поля сохраняются в localStorage.
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

        // Загружаем сохранённые данные
        me.loadCustomData();

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
                            text: 'Сохранить изменения',
                            iconCls: 'fa fa-save',
                            handler: me.saveAllToLocal,
                            scope: me
                        },
                        {
                            text: 'Сбросить все данные',
                            iconCls: 'fa fa-undo',
                            handler: me.resetAllData,
                            scope: me
                        },
                        '->',
                        {
                            text: 'Обновить список из PILOT',
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

    // Загрузка пользовательских данных (customId, deviceType) из localStorage
    loadCustomData: function() {
        var stored = localStorage.getItem('m25_monitor_custom_data');
        if (stored) {
            this.customData = Ext.decode(stored);
        } else {
            this.customData = {};
        }
    },

    // Сохранение всех данных в localStorage
    saveAllToLocal: function() {
        localStorage.setItem('m25_monitor_custom_data', Ext.encode(this.customData));
        Ext.Msg.alert('Сохранено', 'Данные сохранены в браузере');
    },

    // Сброс всех пользовательских данных
    resetAllData: function() {
        var me = this;
        Ext.Msg.confirm('Сброс', 'Удалить все сохранённые ID и типы устройств?', function(btn) {
            if (btn === 'yes') {
                me.customData = {};
                me.saveAllToLocal();
                me.refreshTree();
            }
        });
    },

    // Обновить дерево (перезагрузить из API, сохранив пользовательские данные)
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

        // Настройка редактирования ячеек
        var cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 2,
            listeners: {
                beforeedit: function(editor, context) {
                    // Запрещаем редактирование колонки vehid (она только для чтения)
                    if (context.column.dataIndex === 'vehid') {
                        return false;
                    }
                    return true;
                },
                edit: function(editor, context) {
                    var record = context.record;
                    var field = context.field;
                    var newValue = context.value;
                    var vehid = record.get('vehid');
                    if (!vehid) return;

                    // Инициализируем объект для этого vehid, если его нет
                    if (!me.customData[vehid]) {
                        me.customData[vehid] = {};
                    }

                    if (field === 'customId') {
                        me.customData[vehid].customId = newValue;
                        record.set('customId', newValue);
                    } else if (field === 'deviceType') {
                        me.customData[vehid].deviceType = newValue;
                        record.set('deviceType', newValue);
                    }

                    // Автосохранение после каждого изменения
                    me.saveAllToLocal();
                }
            }
        });

        // Колонка "ID устройства" (пользовательский) – редактируемый текст
        var customIdColumn = {
            text: 'ID устройства',
            dataIndex: 'customId',
            flex: 1.5,
            sortable: true,
            editor: {
                xtype: 'textfield',
                allowBlank: true
            },
            renderer: function(value) {
                return value ? Ext.String.htmlEncode(value) : '—';
            }
        };

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
                { text: 'vehid (системный)', dataIndex: 'vehid', flex: 1, sortable: true },
                customIdColumn,
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

    // Загрузка всех устройств из API
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

    // Нормализация узла с учётом сохранённых данных
    normalizeVehicleNode: function(vehicle) {
        var vehid = vehicle.vehid || vehicle.id;
        var saved = this.customData[vehid] || {};
        // Определяем тип из API, только если он входит в список опций и нет сохранённого
        var apiType = vehicle.model || vehicle.equipment || vehicle.hardware || vehicle.device_type || '';
        var deviceType = saved.deviceType;
        if (!deviceType && this.deviceTypeOptions.indexOf(apiType) !== -1) {
            deviceType = apiType;
        }
        return {
            id: 'veh_' + vehid,
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehid,
            customId: saved.customId || '',
            deviceType: deviceType || '',
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
