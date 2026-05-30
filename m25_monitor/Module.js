/**
 * M25 Monitor — монолитное расширение PILOT.
 * 
 * Использует API PILOT для отображения всех транспортных средств клиента:
 * - /ax/tree.php          — получение иерархии, включая поля equipment, imei, model (если доступны)
 * - /ax/current_data.php  — текущие параметры (скорость, топливо, зажигание)
 * 
 * Левая панель: таблица с колонками: Название, UniqID, Agent ID, Тип (оборудование), IMEI, Модель, Скорость, Топливо, Зажигание.
 * Правая панель: только iframe с внешней страницей (датчики удалены).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения (API PILOT)');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        me.createNavigationTab();
        me.createMainPanel();
        me.navTab.map_frame = me.mainPanel;
        me.loadAllVehicles();

        console.log('[M25] Расширение готово');
    },

    createNavigationTab: function() {
        var me = this;

        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'agent_id', 'name', 'imei', 'equipment', 'model', 'speed', 'fuel', 'ignition'],
            data: [],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2, sortable: true },
                { text: 'UniqID', dataIndex: 'vehid', width: 80, sortable: true },
                { text: 'Agent ID', dataIndex: 'agent_id', width: 100, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: 'Тип', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Модель', dataIndex: 'model', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'IMEI', dataIndex: 'imei', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Скорость', dataIndex: 'speed', width: 70, renderer: function(v) { return v !== undefined ? v + ' км/ч' : '—'; } },
                { text: 'Топливо', dataIndex: 'fuel', width: 80, renderer: function(v) { return v !== undefined ? v + ' л' : '—'; } },
                { text: 'Зажигание', dataIndex: 'ignition', width: 80, renderer: function(v) { return v === 1 ? 'Вкл' : (v === 0 ? 'Выкл' : '—'); } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        me.onVehicleSelect(selected[0]);
                    }
                },
                scope: me
            },
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [{
                    text: 'Обновить список',
                    iconCls: 'fa fa-sync-alt',
                    handler: function() { me.loadAllVehicles(); },
                    scope: me
                }]
            }]
        });

        this.navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [this.vehiclesGrid]
        });
        skeleton.navigation.add(this.navTab);
    },

    createMainPanel: function() {
        this.iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width:100%; height:100%; border:none;'
            },
            getIframeDom: function() {
                var el = this.getEl();
                return el ? el.dom : null;
            }
        });

        this.mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: 'Внешняя страница',
            items: [this.iframe]
        });

        skeleton.mapframe.add(this.mainPanel);
    },

    loadAllVehicles: function() {
        var me = this;
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(true);

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                try {
                    var treeData = Ext.decode(resp.responseText);
                    console.log('[M25] tree.php получен, тип данных:', Ext.typeOf(treeData));
                    console.log('[M25] tree.php, первые 2 элемента:', treeData.slice(0, 2));
                    if (treeData && treeData[0]) {
                        console.log('[M25] Ключи первого узла:', Object.keys(treeData[0]));
                        console.log('[M25] Содержимое первого узла:', treeData[0]);
                    }

                    var allVehicles = me.extractVehiclesWithDetails(treeData);
                    console.log('[M25] Найдено ТС (с деталями из tree.php):', allVehicles.length);

                    if (allVehicles.length === 0) {
                        Ext.Msg.alert('Внимание', 'Не удалось найти транспортные средства. Проверьте консоль (F12).');
                        if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                        return;
                    }

                    Ext.Ajax.request({
                        url: '/ax/current_data.php',
                        success: function(resp2) {
                            var currentData = Ext.decode(resp2.responseText);
                            var currentMap = {};
                            var items = currentData.objects || currentData.data || (Ext.isArray(currentData) ? currentData : []);
                            Ext.Array.each(items, function(item) {
                                if (item.vehid) currentMap[item.vehid] = item;
                            });

                            var records = [];
                            Ext.Array.each(allVehicles, function(veh) {
                                var cur = currentMap[veh.vehid] || {};
                                records.push({
                                    vehid: veh.vehid,
                                    name: veh.name,
                                    agent_id: veh.agent_id || '',
                                    equipment: veh.equipment || '',
                                    model: veh.model || '',
                                    imei: veh.imei || '',
                                    speed: cur.speed,
                                    fuel: cur.fuel,
                                    ignition: cur.ignition
                                });
                            });
                            me.vehiclesStore.loadData(records);
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);

                            if (records.length > 0) {
                                var firstRecord = me.vehiclesStore.getAt(0);
                                me.vehiclesGrid.getSelectionModel().select(firstRecord);
                            }
                        },
                        failure: function() {
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                            Ext.Msg.alert('Ошибка', 'Не удалось загрузить текущие параметры');
                        }
                    });
                } catch(e) {
                    console.error('[M25] Ошибка парсинга tree.php', e);
                    if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                    Ext.Msg.alert('Ошибка', 'Ошибка при разборе данных от PILOT');
                }
            },
            failure: function() {
                if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС (tree.php)');
            }
        });
    },

    extractVehiclesWithDetails: function(nodes) {
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = false;
            if (node.type === 'veh' || node.type === 'object' || node.type === 'unit') {
                isVehicle = true;
            } else if (node.vehid || node.id || node.unit_id) {
                isVehicle = true;
            }

            if (isVehicle) {
                var vehid = node.vehid || node.id || node.unit_id;
                if (vehid) {
                    result.push({
                        vehid: String(vehid),
                        name: node.text || node.name || node.label || 'Без имени',
                        equipment: this.extractField(node, ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type']),
                        imei: this.extractField(node, ['imei', 'serial', 'device_id', 'tracker_serial']),
                        model: this.extractField(node, ['model', 'vehicle_model', 'car_model']),
                        agent_id: this.extractField(node, ['agent_id', 'agentId', 'agent', 'driver_id', 'user_id'])
                    });
                }
            } else if (node.children && node.children.length) {
                result = result.concat(this.extractVehiclesWithDetails(node.children));
            }
        }, this);
        return result;
    },

    extractField: function(node, fieldNames) {
        for (var i = 0; i < fieldNames.length; i++) {
            var val = node[fieldNames[i]];
            if (val !== undefined && val !== null && val !== '') {
                return String(val);
            }
        }
        return '';
    },

    onVehicleSelect: function(record) {
        var vehid = record.get('vehid');
        var url = 'https://mega-info.su/dealer2/?vehicle_id=' + encodeURIComponent(vehid);
        if (this.iframe) {
            var iframeDom = this.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
        }
    }
});
