/**
 * M25 Monitor — монолитное расширение PILOT.
 * Левая панель: таблица всех ТС клиента с колонками:
 *   - Название
 *   - UniqID (vehid)
 *   - Agent ID (если присутствует в данных)
 *   - Тип (оборудование)
 *   - IMEI
 *   - Скорость, топливо, зажигание (текущие данные)
 * Правая панель: датчики выбранного ТС + iframe с внешней страницей.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация монолитного расширения (Agent ID + параметры)');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        // Создаём левую панель с таблицей устройств (включая Agent ID)
        me.createNavigationTab();

        // Создаём правую панель (датчики + iframe)
        me.createMainPanel();

        // Связываем панели через map_frame
        me.navTab.map_frame = me.mainPanel;

        // Загружаем данные
        me.loadAllVehicles();

        console.log('[M25] Расширение готово, левая панель содержит Agent ID и параметры');
    },

    /**
     * Левая панель: таблица со списком всех ТС (включая Agent ID)
     */
    createNavigationTab: function() {
        var me = this;

        // Хранилище для ТС
        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'agent_id', 'name', 'imei', 'equipment', 'speed', 'fuel', 'ignition'],
            data: [],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        // Таблица (грид) с колонками
        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2, sortable: true },
                { text: 'UniqID', dataIndex: 'vehid', width: 80, sortable: true },
                { text: 'Agent ID', dataIndex: 'agent_id', width: 100, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: 'Тип', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
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

        // Оборачиваем в LeftBarPanel (стандартный контейнер PILOT)
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

        // Хранилище для датчиков
        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: []
        });

        // Таблица датчиков
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

        // iframe для внешней страницы
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

        // Собираем правую панель
        this.mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            title: 'Детальная информация',
            items: [this.sensorGrid, this.iframe]
        });

        skeleton.mapframe.add(this.mainPanel);
    },

    /**
     * Загрузка всех ТС из PILOT (объединение tree.php и current_data.php)
     */
    loadAllVehicles: function() {
        var me = this;
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(true);

        // 1. Получаем иерархию ТС (IMEI, оборудование, agent_id)
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                try {
                    var treeData = Ext.decode(resp.responseText);
                    console.log('[M25] tree.php получен, первый узел:', treeData[0]);
                    var allVehicles = me.extractAllVehicles(treeData);
                    console.log('[M25] Всего извлечено ТС:', allVehicles.length);

                    // 2. Получаем текущие данные (скорость, топливо, зажигание)
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
                                    agent_id: veh.agent_id,
                                    name: veh.name,
                                    imei: veh.imei,
                                    equipment: veh.equipment,
                                    speed: cur.speed,
                                    fuel: cur.fuel,
                                    ignition: cur.ignition
                                });
                            });
                            me.vehiclesStore.loadData(records);
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                            if (records.length === 0) {
                                Ext.Msg.alert('Информация', 'Не найдено ни одного транспортного средства');
                            }
                        },
                        failure: function() {
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                            Ext.Msg.alert('Ошибка', 'Не удалось загрузить текущие данные');
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
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС');
            }
        });
    },

    /**
     * Рекурсивный обход дерева PILOT, сбор всех транспортных средств
     * Пытаемся извлечь: vehid, name, imei, equipment, agent_id
     */
    extractAllVehicles: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            if (isVehicle) {
                // Извлекаем vehid (может быть в поле id или vehid)
                var vehid = node.vehid || node.id;
                if (!vehid) return; // пропускаем, если нет ID
                result.push({
                    vehid: vehid,
                    name: node.text || node.name || 'Без имени',
                    imei: me.extractImei(node),
                    equipment: me.extractEquipment(node),
                    agent_id: me.extractAgentId(node)
                });
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllVehicles(node.children));
            }
        });
        return result;
    },

    /**
     * Извлечение Agent ID из узла (пробуем разные варианты)
     */
    extractAgentId: function(node) {
        var candidates = ['agent_id', 'agentId', 'agentid', 'agent', 'driver_id', 'user_id'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val !== undefined && val !== null) {
                return String(val);
            }
        }
        // Если нет явного Agent ID, можно вернуть '—' или пустую строку
        return '';
    },

    /**
     * Извлечение модели оборудования из узла
     */
    extractEquipment: function(node) {
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type', 'module'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim()) return val;
        }
        for (var key in node) {
            if (typeof node[key] === 'string' && node[key].trim()) {
                var lower = key.toLowerCase();
                if (lower.indexOf('equip') !== -1 || lower.indexOf('device') !== -1 || lower.indexOf('model') !== -1) {
                    return node[key];
                }
            }
        }
        return '';
    },

    /**
     * Извлечение IMEI из узла
     */
    extractImei: function(node) {
        var candidates = ['imei', 'serial', 'device_id', 'tracker_serial', 'serial_number'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim()) return val;
        }
        return '';
    },

    /**
     * Обработчик выбора ТС в левой таблице
     */
    onVehicleSelect: function(record) {
        var vehid = record.get('vehid');
        var url = 'https://mega-info.su/dealer2/?vehicle_id=' + encodeURIComponent(vehid);
        if (this.iframe) {
            var iframeDom = this.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
        }
        this.loadDetailedSensors(vehid);
    },

    /**
     * Загрузка детальных датчиков для выбранного ТС
     */
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

    /**
     * Отображение датчиков в правой таблице
     */
    displayDetailedSensors: function(vehicleData) {
        var records = [];
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.vehid) records.push({ param: 'UniqID', value: vehicleData.vehid, unit: '' });
        if (vehicleData.agent_id) records.push({ param: 'Agent ID', value: vehicleData.agent_id, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Тип (оборудование)', value: vehicleData.equipment, unit: '' });
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
