/**
 * M25 Monitor — монолитное расширение PILOT.
 * 
 * Использует API PILOT для отображения всех транспортных средств клиента:
 * - /ax/tree.php          — получение иерархии (список vehid, названия)
 * - /ax/current_data.php  — текущие параметры (скорость, топливо, зажигание)
 * - /ax/unit_info.php     — детальная информация об оборудовании, IMEI, модели (при необходимости)
 * 
 * Левая панель: таблица с колонками: Название, UniqID, Agent ID, Тип (оборудование), IMEI, Скорость, Топливо, Зажигание.
 * Правая панель: детальные датчики выбранного ТС + iframe с внешней страницей.
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

        // Создаём левую панель с таблицей устройств
        me.createNavigationTab();

        // Создаём правую панель (датчики + iframe)
        me.createMainPanel();

        // Связываем панели через map_frame
        me.navTab.map_frame = me.mainPanel;

        // Загружаем данные
        me.loadAllVehicles();

        console.log('[M25] Расширение готово');
    },

    /**
     * Левая панель: таблица со списком всех ТС
     */
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

    /**
     * Правая панель: датчики (сверху) + iframe (снизу)
     */
    createMainPanel: function() {
        var me = this;

        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: []
        });

        this.sensorGrid = Ext.create('Ext.grid.Panel', {
            title: 'Датчики и параметры выбранного ТС',
            height: 250,
            collapsible: true,
            collapsed: false,
            store: this.sensorStore,
            columns: [
                { text: 'Параметр', dataIndex: 'param', flex: 2 },
                { text: 'Значение', dataIndex: 'value', flex: 2 },
                { text: 'Ед. изм.', dataIndex: 'unit', flex: 1 }
            ],
            viewConfig: { emptyText: 'Выберите устройство в левой панели' }
        });

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
            layout: 'border',
            title: 'Детальная информация',
            items: [this.sensorGrid, this.iframe]
        });

        skeleton.mapframe.add(this.mainPanel);
    },

    /**
     * Основной метод загрузки всех транспортных средств.
     */
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
                    // Детально выводим первый узел, чтобы увидеть все поля
                    if (treeData && treeData[0]) {
                        console.log('[M25] Ключи первого узла:', Object.keys(treeData[0]));
                    }

                    var allVehiclesBasic = me.extractBasicVehicles(treeData);
                    console.log('[M25] Найдено ТС (базово):', allVehiclesBasic.length);

                    if (allVehiclesBasic.length === 0) {
                        Ext.Msg.alert('Внимание', 'Не удалось найти транспортные средства. Проверьте консоль (F12) для деталей.');
                        if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                        return;
                    }

                    // Загружаем текущие данные
                    Ext.Ajax.request({
                        url: '/ax/current_data.php',
                        success: function(resp2) {
                            var currentData = Ext.decode(resp2.responseText);
                            var currentMap = {};
                            var items = currentData.objects || currentData.data || (Ext.isArray(currentData) ? currentData : []);
                            Ext.Array.each(items, function(item) {
                                if (item.vehid) currentMap[item.vehid] = item;
                            });

                            // Для каждого ТС загружаем детали через unit_info
                            me.loadDetailedInfoForVehicles(allVehiclesBasic, currentMap, 0, []);
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

    /**
     * Рекурсивно извлекает из дерева базовые данные: vehid, name.
     * Поддерживает различные варианты полей (vehid, id, unit_id, type === 'veh', 'object' и т.п.)
     */
    extractBasicVehicles: function(nodes) {
        var result = [];
        Ext.Array.each(nodes, function(node) {
            // Определяем, является ли узел транспортным средством
            var isVehicle = false;
            if (node.type === 'veh' || node.type === 'object' || node.type === 'unit') {
                isVehicle = true;
            } else if (node.vehid || node.id || node.unit_id) {
                // Если есть какой-то ID, скорее всего это ТС
                isVehicle = true;
            }

            if (isVehicle) {
                var vehid = node.vehid || node.id || node.unit_id;
                if (vehid) {
                    result.push({
                        vehid: vehid,
                        name: node.text || node.name || node.label || 'Без имени'
                    });
                } else {
                    console.warn('[M25] Узел определён как ТС, но нет ID:', node);
                }
            } else if (node.children && node.children.length) {
                result = result.concat(this.extractBasicVehicles(node.children));
            }
        }, this);
        return result;
    },

    /**
     * Последовательно загружает детальную информацию для каждого ТС через /ax/unit_info.php.
     */
    loadDetailedInfoForVehicles: function(vehiclesList, currentMap, index, finalRecords) {
        var me = this;
        if (index >= vehiclesList.length) {
            me.vehiclesStore.loadData(finalRecords);
            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
            if (finalRecords.length === 0) {
                Ext.Msg.alert('Информация', 'Не найдено ни одного транспортного средства');
            }
            return;
        }

        var veh = vehiclesList[index];
        var vehid = veh.vehid;
        var cur = currentMap[vehid] || {};

        Ext.Ajax.request({
            url: '/ax/unit_info.php',
            params: { vehid: vehid },
            success: function(resp) {
                try {
                    var unitData = Ext.decode(resp.responseText);
                    var equipment = unitData.equipment || unitData.model || unitData.device || '';
                    var imei = unitData.imei || unitData.serial || '';
                    var model = unitData.model || unitData.vehicle_model || '';
                    var agent_id = unitData.agent_id || unitData.driver_id || '';

                    finalRecords.push({
                        vehid: vehid,
                        name: veh.name,
                        agent_id: agent_id,
                        equipment: equipment,
                        model: model,
                        imei: imei,
                        speed: cur.speed,
                        fuel: cur.fuel,
                        ignition: cur.ignition
                    });
                } catch(e) {
                    console.error('[M25] Ошибка в unit_info для vehid', vehid, e);
                    finalRecords.push({
                        vehid: vehid,
                        name: veh.name,
                        agent_id: '',
                        equipment: '',
                        model: '',
                        imei: '',
                        speed: cur.speed,
                        fuel: cur.fuel,
                        ignition: cur.ignition
                    });
                }
                me.loadDetailedInfoForVehicles(vehiclesList, currentMap, index + 1, finalRecords);
            },
            failure: function() {
                console.warn('[M25] Не удалось загрузить unit_info для vehid', vehid);
                finalRecords.push({
                    vehid: vehid,
                    name: veh.name,
                    agent_id: '',
                    equipment: '',
                    model: '',
                    imei: '',
                    speed: cur.speed,
                    fuel: cur.fuel,
                    ignition: cur.ignition
                });
                me.loadDetailedInfoForVehicles(vehiclesList, currentMap, index + 1, finalRecords);
            }
        });
    },

    onVehicleSelect: function(record) {
        var vehid = record.get('vehid');
        var url = 'https://mega-info.su/dealer2/?vehicle_id=' + encodeURIComponent(vehid);
        if (this.iframe) {
            var iframeDom = this.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
        }
        this.loadDetailedSensors(vehid);
    },

    loadDetailedSensors: function(vehid) {
        var me = this;
        if (this.sensorGrid) this.sensorGrid.setLoading(true);
        Ext.Ajax.request({
            url: '/ax/current_data.php',
            params: { vehid: vehid },
            success: function(resp) {
                try {
                    var data = Ext.decode(resp.responseText);
                    var vehicles = data.objects || data.data || (Ext.isArray(data) ? data : []);
                    var vehicleData = null;
                    if (Ext.isArray(vehicles)) {
                        vehicleData = Ext.Array.findBy(vehicles, function(v) { return v.vehid == vehid || v.id == vehid; });
                    } else if (vehicles && typeof vehicles === 'object') {
                        vehicleData = vehicles;
                    }
                    if (vehicleData) {
                        me.displayDetailedSensors(vehicleData);
                    } else {
                        me.sensorStore.loadData([{ param: 'Статус', value: 'Нет данных', unit: '' }]);
                    }
                } catch(e) {
                    console.error('[M25] Ошибка датчиков', e);
                }
                if (me.sensorGrid) me.sensorGrid.setLoading(false);
            },
            failure: function() {
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить датчики', unit: '' }]);
                if (me.sensorGrid) me.sensorGrid.setLoading(false);
            }
        });
    },

    displayDetailedSensors: function(vehicleData) {
        var records = [];
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.vehid) records.push({ param: 'UniqID', value: vehicleData.vehid, unit: '' });
        if (vehicleData.agent_id) records.push({ param: 'Agent ID', value: vehicleData.agent_id, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Оборудование', value: vehicleData.equipment, unit: '' });
        if (vehicleData.speed !== undefined) records.push({ param: 'Скорость', value: vehicleData.speed, unit: 'км/ч' });
        if (vehicleData.fuel !== undefined) records.push({ param: 'Топливо', value: vehicleData.fuel, unit: 'л' });
        if (vehicleData.ignition !== undefined) records.push({ param: 'Зажигание', value: vehicleData.ignition === 1 ? 'Вкл' : 'Выкл', unit: '' });
        if (vehicleData.mileage !== undefined) records.push({ param: 'Пробег', value: vehicleData.mileage, unit: 'км' });
        if (vehicleData.engine_hours !== undefined) records.push({ param: 'Моточасы', value: vehicleData.engine_hours, unit: 'ч' });

        var sensors = vehicleData.sensors || [];
        if (Ext.isArray(sensors)) {
            Ext.Array.each(sensors, function(s) {
                records.push({
                    param: s.name || s.label || 'Датчик',
                    value: s.value !== undefined ? s.value : '—',
                    unit: s.unit || ''
                });
            });
        }

        if (records.length === 0) {
            records.push({ param: 'Информация', value: 'Нет дополнительных датчиков', unit: '' });
        }
        this.sensorStore.loadData(records);
    }
});
