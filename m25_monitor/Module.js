/**
 * M25 Monitor — монолитное расширение PILOT.
 * Добавляет вкладку в левую навигацию и полноценную страницу с таблицей ТС.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    /**
     * Точка входа, вызывается PILOT после загрузки расширения
     */
    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация монолитного расширения');

        // Проверяем готовность skeleton
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        // Создаём левую вкладку (навигацию)
        me.createNavigationTab();

        // Создаём правую панель (основной контент)
        me.createMainPanel();

        console.log('[M25] Расширение готово, вкладка добавлена в левое меню');
    },

    /**
     * Создаёт вкладку в левой навигации PILOT
     */
    createNavigationTab: function() {
        var me = this;

        // Создаём саму вкладку с заголовком и иконкой
        this.navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',                       // ← название вкладки
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [{
                xtype: 'component',
                html: '<div style="padding:10px;text-align:center;">Выберите M25 Monitor в правой панели</div>'
            }]
        });

        // Привязываем правую панель к вкладке (через map_frame)
        this.navTab.map_frame = this.mainPanel;

        // Добавляем вкладку в левое меню
        skeleton.navigation.add(this.navTab);
    },

    /**
     * Создаёт основную панель (правую область) со всем функционалом
     */
    createMainPanel: function() {
        var me = this;

        // --- Левая часть: таблица всех ТС ---
        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'imei', 'equipment', 'speed', 'fuel', 'ignition'],
            data: [],
            sorters: [{ property: 'name', direction: 'ASC' }]
        });

        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            region: 'west',
            width: '40%',
            split: true,
            title: 'Транспортные средства',
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2, sortable: true },
                { text: 'IMEI', dataIndex: 'imei', flex: 1.5, renderer: function(v) { return v || '—'; } },
                { text: 'Оборудование', dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } },
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

        // --- Правая часть: датчики (сверху) + iframe (снизу) ---
        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: []
        });

        this.sensorGrid = Ext.create('Ext.grid.Panel', {
            title: 'Датчики и параметры (выберите ТС)',
            height: 250,
            collapsible: true,
            collapsed: false,
            store: this.sensorStore,
            columns: [
                { text: 'Параметр', dataIndex: 'param', flex: 2 },
                { text: 'Значение', dataIndex: 'value', flex: 2 },
                { text: 'Ед. изм.', dataIndex: 'unit', flex: 1 }
            ],
            viewConfig: { emptyText: 'Выберите транспортное средство из списка слева' }
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

        var rightPanel = Ext.create('Ext.panel.Panel', {
            region: 'center',
            layout: 'border',
            items: [this.sensorGrid, this.iframe]
        });

        // Главная панель с border-раскладкой
        this.mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'border',
            title: 'M25 Monitor — мониторинг транспорта',
            items: [this.vehiclesGrid, rightPanel]
        });

        // Добавляем панель в mapframe PILOT (правая область)
        skeleton.mapframe.add(this.mainPanel);

        // Загружаем список ТС при создании
        this.loadAllVehicles();
    },

    /**
     * Загрузка всех ТС из PILOT (tree.php + current_data.php)
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
                    var allVehicles = me.extractAllVehicles(treeData);

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
                                    imei: veh.imei,
                                    equipment: veh.equipment,
                                    speed: cur.speed,
                                    fuel: cur.fuel,
                                    ignition: cur.ignition
                                });
                            });
                            me.vehiclesStore.loadData(records);
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                        },
                        failure: function() {
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                        }
                    });
                } catch(e) {
                    console.error('[M25] Ошибка парсинга tree.php', e);
                    if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                }
            },
            failure: function() {
                if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
            }
        });
    },

    /**
     * Рекурсивный сбор всех транспортных средств из дерева PILOT
     */
    extractAllVehicles: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            if (isVehicle) {
                result.push({
                    vehid: node.vehid,
                    name: node.text || node.name || 'Без имени',
                    imei: me.extractImei(node),
                    equipment: me.extractEquipment(node)
                });
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllVehicles(node.children));
            }
        });
        return result;
    },

    // Вспомогательные методы извлечения данных из узла PILOT
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

    extractImei: function(node) {
        var candidates = ['imei', 'serial', 'device_id', 'tracker_serial'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim()) return val;
        }
        return '';
    },

    /**
     * Обработчик выбора ТС в таблице
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
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить', unit: '' }]);
                if (me.sensorGrid) me.sensorGrid.setLoading(false);
            }
        });
    },

    /**
     * Отображает полученные датчики в таблице
     */
    displayDetailedSensors: function(vehicleData) {
        var records = [];
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
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
