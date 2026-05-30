/**
 * MainPanel.js — отображение всех транспортных средств клиента.
 * - Загружает список всех ТС из /ax/tree.php (объединяя с текущими данными из /ax/current_data.php)
 * - Показывает таблицу: Название, IMEI, Оборудование, Скорость, Топливо, Зажигание
 * - При клике на строку загружается iframe с внешней страницей и детальные датчики
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'border',
    title: (typeof l === 'function') ? l('M25 Monitor — все объекты клиента') : 'M25 Monitor',

    currentVehicleId: null,
    iframe: null,
    sensorGrid: null,
    vehiclesGrid: null,

    initComponent: function() {
        // Создаём левую часть (грид со списком ТС)
        this.createVehiclesGrid();
        // Создаём правую часть (iframe + датчики)
        this.createRightPanel();

        this.items = [
            this.vehiclesGrid,   // region: west
            this.rightPanel      // region: center
        ];
        this.callParent(arguments);
        // Загружаем данные
        this.loadAllVehicles();
    },

    /**
     * Грид со всеми ТС (занимает 40% ширины)
     */
    createVehiclesGrid: function() {
        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'imei', 'equipment', 'speed', 'fuel', 'ignition', 'rawData'],
            data: [],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            region: 'west',
            width: '40%',
            split: true,
            title: (typeof l === 'function') ? l('Транспортные средства') : 'ТС клиента',
            store: this.vehiclesStore,
            columns: [
                { text: (typeof l === 'function') ? l('Название') : 'Название', dataIndex: 'name', flex: 2, sortable: true },
                { text: 'IMEI', dataIndex: 'imei', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: (typeof l === 'function') ? l('Оборудование') : 'Оборудование', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: (typeof l === 'function') ? l('Скорость') : 'Скорость', dataIndex: 'speed', width: 70, renderer: function(v) { return v !== undefined ? v + ' км/ч' : '—'; } },
                { text: (typeof l === 'function') ? l('Топливо') : 'Топливо', dataIndex: 'fuel', width: 80, renderer: function(v) { return v !== undefined ? v + ' л' : '—'; } },
                { text: (typeof l === 'function') ? l('Зажигание') : 'Зажигание', dataIndex: 'ignition', width: 80, renderer: function(v) { return v === 1 ? 'Вкл' : (v === 0 ? 'Выкл' : '—'); } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        this.onVehicleSelect(record);
                    }
                },
                scope: this
            },
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    {
                        text: (typeof l === 'function') ? l('Обновить') : 'Обновить',
                        iconCls: 'fa fa-sync-alt',
                        handler: this.loadAllVehicles,
                        scope: this
                    }
                ]
            }]
        });
    },

    /**
     * Правая панель: верхняя часть – датчики, центральная – iframe
     */
    createRightPanel: function() {
        // Таблица датчиков (детальная информация по выбранному ТС)
        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: []
        });
        this.sensorGrid = Ext.create('Ext.grid.Panel', {
            title: (typeof l === 'function') ? l('Датчики и параметры') : 'Данные ТС',
            height: 250,
            collapsible: true,
            collapsed: false,
            store: this.sensorStore,
            columns: [
                { text: (typeof l === 'function') ? l('Параметр') : 'Параметр', dataIndex: 'param', flex: 2 },
                { text: (typeof l === 'function') ? l('Значение') : 'Значение', dataIndex: 'value', flex: 2 },
                { text: (typeof l === 'function') ? l('Ед. изм.') : 'Ед. изм.', dataIndex: 'unit', flex: 1 }
            ],
            viewConfig: { emptyText: (typeof l === 'function') ? l('Выберите ТС из списка слева') : 'Выберите ТС' }
        });

        // iframe для внешней страницы
        this.iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() {
                var el = this.getEl();
                return el ? el.dom : null;
            }
        });

        // Собираем правую панель
        this.rightPanel = Ext.create('Ext.panel.Panel', {
            region: 'center',
            layout: 'border',
            items: [
                this.sensorGrid,   // север
                this.iframe        // центр
            ]
        });
    },

    /**
     * Загрузка всех ТС: объединение данных из /ax/tree.php (IMEI, оборудование)
     * и /ax/current_data.php (скорость, топливо, зажигание)
     */
    loadAllVehicles: function() {
        var me = this;
        this.vehiclesGrid.setLoading(true);

        // Сначала получаем иерархию всех ТС (с IMEI и оборудованием)
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var treeData = Ext.decode(response.responseText);
                    var allVehicles = me.extractAllVehicles(treeData); // рекурсивный сбор без фильтрации

                    // Теперь получаем текущие данные (скорость, топливо, зажигание)
                    Ext.Ajax.request({
                        url: '/ax/current_data.php',
                        success: function(resp2) {
                            try {
                                var currentData = Ext.decode(resp2.responseText);
                                var currentMap = {};
                                // currentData может быть массивом объектов или объектом с полем objects
                                var items = currentData.objects || currentData.data || (Ext.isArray(currentData) ? currentData : []);
                                Ext.Array.each(items, function(item) {
                                    if (item.vehid) {
                                        currentMap[item.vehid] = item;
                                    }
                                });

                                // Объединяем
                                var records = [];
                                Ext.Array.each(allVehicles, function(veh) {
                                    var cur = currentMap[veh.vehid] || {};
                                    records.push({
                                        vehid: veh.vehid,
                                        name: veh.name,
                                        imei: veh.imei,
                                        equipment: veh.equipment,
                                        speed: cur.speed,
                                        fuel: cur.fuel,
                                        ignition: cur.ignition,
                                        rawData: cur
                                    });
                                });
                                me.vehiclesStore.loadData(records);
                                if (records.length === 0) {
                                    Ext.Msg.alert((typeof l === 'function') ? l('Информация') : 'Информация', 'Нет транспортных средств в системе');
                                }
                            } catch(e) {
                                console.error('[M25] Ошибка current_data', e);
                            }
                            me.vehiclesGrid.setLoading(false);
                        },
                        failure: function() {
                            me.vehiclesGrid.setLoading(false);
                            Ext.Msg.alert('Ошибка', 'Не удалось загрузить текущие данные');
                        }
                    });
                } catch(e) {
                    console.error('[M25] Ошибка tree.php', e);
                    me.vehiclesGrid.setLoading(false);
                }
            },
            failure: function() {
                me.vehiclesGrid.setLoading(false);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС');
            }
        });
    },

    /**
     * Рекурсивный обход дерева PILOT, сбор ВСЕХ транспортных средств (без фильтрации)
     */
    extractAllVehicles: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            if (isVehicle) {
                result.push({
                    vehid: node.vehid,
                    name: node.text || node.name || (typeof l === 'function') ? l('Без имени') : 'Без имени',
                    imei: me.extractImei(node),
                    equipment: me.extractEquipment(node)
                });
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllVehicles(node.children));
            }
        });
        return result;
    },

    extractEquipment: function(node) {
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type', 'module'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim() !== '') return val;
        }
        for (var key in node) {
            if (typeof node[key] === 'string' && node[key].trim() !== '') {
                var lowerKey = key.toLowerCase();
                if (lowerKey.indexOf('equip') !== -1 || lowerKey.indexOf('device') !== -1 || lowerKey.indexOf('model') !== -1) {
                    return node[key];
                }
            }
        }
        return '';
    },

    extractImei: function(node) {
        var candidates = ['imei', 'serial', 'device_id', 'tracker_serial'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim() !== '') return val;
        }
        return '';
    },

    /**
     * Выбор ТС из таблицы
     */
    onVehicleSelect: function(record) {
        var me = this;
        var vehid = record.get('vehid');
        var vehicleName = record.get('name');
        me.currentVehicleId = vehid;

        // Обновляем заголовок правой панели
        this.rightPanel.setTitle((typeof l === 'function') ? l('Детали: ') + vehicleName : vehicleName);

        // Загружаем iframe
        var url = 'https://mega-info.su/dealer2/?vehicle_id=' + encodeURIComponent(vehid);
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) iframeDom.src = url;

        // Загружаем детальные датчики (более полные, чем в таблице)
        me.loadDetailedSensors(vehid);
    },

    /**
     * Запрос детальных датчиков для выбранного ТС (используем /ax/current_data.php с vehid)
     */
    loadDetailedSensors: function(vehid) {
        var me = this;
        this.sensorGrid.setLoading(true);
        Ext.Ajax.request({
            url: '/ax/current_data.php',
            params: { vehid: vehid },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    var vehicles = data.objects || data.data || (Ext.isArray(data) ? data : []);
                    var vehicleData = null;
                    if (Ext.isArray(vehicles)) {
                        vehicleData = Ext.Array.findBy(vehicles, function(v) {
                            return v.vehid == vehid || v.id == vehid;
                        });
                    } else if (vehicles && typeof vehicles === 'object') {
                        vehicleData = vehicles;
                    }
                    if (vehicleData) {
                        me.displayDetailedSensors(vehicleData);
                    } else {
                        me.sensorStore.loadData([{ param: 'Статус', value: 'Нет данных по датчикам', unit: '' }]);
                    }
                } catch(e) {
                    console.error('[M25] Ошибка датчиков', e);
                }
                me.sensorGrid.setLoading(false);
            },
            failure: function() {
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить датчики', unit: '' }]);
                me.sensorGrid.setLoading(false);
            }
        });
    },

    displayDetailedSensors: function(vehicleData) {
        var records = [];
        // Основные поля
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Оборудование', value: vehicleData.equipment, unit: '' });
        if (vehicleData.speed !== undefined) records.push({ param: 'Скорость', value: vehicleData.speed, unit: 'км/ч' });
        if (vehicleData.fuel !== undefined) records.push({ param: 'Топливо', value: vehicleData.fuel, unit: 'л' });
        if (vehicleData.ignition !== undefined) records.push({ param: 'Зажигание', value: vehicleData.ignition === 1 ? 'Вкл' : 'Выкл', unit: '' });
        if (vehicleData.mileage !== undefined) records.push({ param: 'Пробег', value: vehicleData.mileage, unit: 'км' });
        if (vehicleData.engine_hours !== undefined) records.push({ param: 'Моточасы', value: vehicleData.engine_hours, unit: 'ч' });

        // Кастомные датчики
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
