/**
 * M25 Monitor — финальная версия с расширенной диагностикой.
 * Отображает все ТС, загруженные из PILOT, с максимальной совместимостью.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация (расширенная диагностика)');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        me.createNavigationTab();
        // Правую панель не создаём (только таблица)
        me.loadAllVehicles();

        console.log('[M25] Расширение запущено');
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

    loadAllVehicles: function() {
        var me = this;
        if (this.vehiclesGrid) this.vehiclesGrid.setLoading(true);

        // 1. Загружаем иерархию
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                var rawData;
                try {
                    rawData = Ext.decode(resp.responseText);
                } catch(e) {
                    console.error('[M25] Ошибка парсинга tree.php:', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось разобрать ответ от PILOT. Смотрите консоль.');
                    if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                    return;
                }
                console.log('[M25] tree.php ОТВЕТ ПОЛНОСТЬЮ:', rawData);
                
                // Нормализуем ответ в массив узлов
                var nodes = me.normalizeTreeResponse(rawData);
                console.log('[M25] Нормализованные узлы:', nodes);
                
                var allVehicles = me.extractAllVehiclesUniversal(nodes);
                console.log('[M25] Найдено ТС:', allVehicles.length);
                
                if (allVehicles.length === 0) {
                    Ext.Msg.alert('Внимание', 'Не найдено ни одного ТС. Проверьте консоль (F12) для деталей.');
                    if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                    return;
                }
                
                // 2. Загружаем текущие параметры
                Ext.Ajax.request({
                    url: '/ax/current_data.php',
                    success: function(resp2) {
                        var currentRaw;
                        try {
                            currentRaw = Ext.decode(resp2.responseText);
                        } catch(e) {
                            console.error('[M25] Ошибка парсинга current_data:', e);
                            if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                            return;
                        }
                        console.log('[M25] current_data ОТВЕТ ПОЛНОСТЬЮ:', currentRaw);
                        
                        var currentMap = me.normalizeCurrentData(currentRaw);
                        
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
                    },
                    failure: function(resp2) {
                        console.error('[M25] Ошибка current_data, статус:', resp2.status);
                        Ext.Msg.alert('Ошибка', 'Не удалось загрузить текущие параметры. Статус: ' + resp2.status);
                        if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
                    }
                });
            },
            failure: function(resp) {
                console.error('[M25] Ошибка tree.php, статус:', resp.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС. Статус: ' + resp.status);
                if (me.vehiclesGrid) me.vehiclesGrid.setLoading(false);
            }
        });
    },

    // Приводит ответ tree.php к массиву узлов (работает с объектами и массивами)
    normalizeTreeResponse: function(data) {
        if (Ext.isArray(data)) {
            return data;
        }
        if (data && Ext.isObject(data)) {
            // Возможные поля, содержащие корневой массив
            if (data.root && Ext.isArray(data.root)) return data.root;
            if (data.data && Ext.isArray(data.data)) return data.data;
            if (data.children && Ext.isArray(data.children)) return data.children;
            // Если всё плохо, пробуем взять первый ключ, который является массивом
            for (var key in data) {
                if (Ext.isArray(data[key])) return data[key];
            }
        }
        return [];
    },

    // Приводит ответ current_data к карте { vehid: данные }
    normalizeCurrentData: function(data) {
        var map = {};
        var items = [];
        if (Ext.isArray(data)) {
            items = data;
        } else if (data && Ext.isObject(data)) {
            items = data.objects || data.data || data.items || [];
        }
        Ext.Array.each(items, function(item) {
            var id = item.vehid || item.id || item.unit_id;
            if (id) {
                map[String(id)] = item;
            }
        });
        return map;
    },

    // Универсальный рекурсивный сбор ТС из любых узлов
    extractAllVehiclesUniversal: function(nodes) {
        var result = [];
        var me = this;
        
        Ext.Array.each(nodes, function(node) {
            // Определяем, является ли узел транспортным средством
            var isVehicle = false;
            // По типу
            if (node.type === 'veh' || node.type === 'object' || node.type === 'unit' || node.type === 'item') {
                isVehicle = true;
            }
            // По наличию идентификатора
            if (!isVehicle && (node.vehid || node.id || node.unit_id)) {
                isVehicle = true;
            }
            // Дополнительно: если есть поля speed, fuel, ignition – скорее всего ТС
            if (!isVehicle && (node.speed !== undefined || node.fuel !== undefined)) {
                isVehicle = true;
            }
            
            if (isVehicle) {
                var vehid = node.vehid || node.id || node.unit_id;
                if (vehid) {
                    result.push({
                        vehid: String(vehid),
                        name: node.text || node.name || node.label || 'Без имени',
                        equipment: me.extractField(node, ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type', 'type_name']),
                        imei: me.extractField(node, ['imei', 'serial', 'device_id', 'tracker_serial', 'serial_number']),
                        model: me.extractField(node, ['model', 'vehicle_model', 'car_model', 'model_name']),
                        agent_id: me.extractField(node, ['agent_id', 'agentId', 'agent', 'driver_id', 'user_id', 'driver'])
                    });
                } else {
                    console.warn('[M25] Узел определён как ТС, но нет ID:', node);
                }
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllVehiclesUniversal(node.children));
            } else if (node.items && node.items.length) {
                result = result.concat(me.extractAllVehiclesUniversal(node.items));
            }
        });
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
    }
});
