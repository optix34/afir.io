/**
 * M25 Monitor — расширение для отображения всех ТС клиента.
 * 
 * Диагностическая версия: выводит в консоль все ответы API,
 * пытается извлечь ТС из различных структур.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация (диагностическая версия)');

        if (!window.skeleton || !skeleton.navigation) {
            Ext.defer(function() { me.initModule(); }, 500, me);
            return;
        }

        me.createNavigationTab();
        me.loadAllVehicles();

        console.log('[M25] Интерфейс создан, начинаем загрузку данных');
    },

    createNavigationTab: function() {
        var me = this;

        this.vehiclesStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'name', 'imei', 'equipment', 'model', 'agent_id', 'speed', 'fuel', 'ignition'],
            data: []
        });

        this.vehiclesGrid = Ext.create('Ext.grid.Panel', {
            store: this.vehiclesStore,
            columns: [
                { text: 'Название', dataIndex: 'name', flex: 2 },
                { text: 'UniqID', dataIndex: 'vehid', width: 80 },
                { text: 'Agent ID', dataIndex: 'agent_id', width: 100, renderer: function(v) { return v || '—'; } },
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

        // 1. Запрос дерева объектов
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                console.log('[M25] tree.php статус:', response.status);
                console.log('[M25] tree.php текст ответа (первые 500 символов):', response.responseText.substring(0, 500));
                
                try {
                    var treeData = Ext.decode(response.responseText);
                    console.log('[M25] tree.php тип данных:', Ext.typeOf(treeData));
                    console.log('[M25] tree.php полный объект:', treeData);
                    
                    // Пытаемся извлечь массив узлов (разные варианты)
                    var nodes = me.extractNodesArray(treeData);
                    console.log('[M25] Извлечено узлов для обхода:', nodes ? nodes.length : 0);
                    
                    if (!nodes || nodes.length === 0) {
                        console.warn('[M25] Не удалось получить узлы из tree.php');
                        me.showError('Не удалось получить список ТС (пустой ответ)');
                        return;
                    }
                    
                    var allVehicles = me.extractVehiclesFromNodes(nodes);
                    console.log('[M25] Найдено ТС (результат):', allVehicles);
                    
                    // 2. Запрос текущих данных
                    Ext.Ajax.request({
                        url: '/ax/current_data.php',
                        success: function(respCurrent) {
                            console.log('[M25] current_data.php статус:', respCurrent.status);
                            console.log('[M25] current_data.php текст (первые 500):', respCurrent.responseText.substring(0, 500));
                            try {
                                var currentData = Ext.decode(respCurrent.responseText);
                                var currentMap = {};
                                var items = me.extractDataArray(currentData);
                                if (items) {
                                    Ext.Array.each(items, function(item) {
                                        if (item.vehid) currentMap[item.vehid] = item;
                                    });
                                }
                                
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
                                console.log('[M25] Загружено записей в таблицу:', records.length);
                            } catch(e) {
                                console.error('[M25] Ошибка парсинга current_data', e);
                                me.showError('Ошибка разбора current_data: ' + e.message);
                            }
                            me.vehiclesGrid.setLoading(false);
                        },
                        failure: function(respCurrent) {
                            console.error('[M25] Ошибка current_data:', respCurrent.status);
                            me.showError('Не удалось загрузить текущие параметры (статус ' + respCurrent.status + ')');
                            me.vehiclesGrid.setLoading(false);
                        }
                    });
                } catch(e) {
                    console.error('[M25] Ошибка парсинга tree.php', e);
                    me.showError('Ошибка разбора tree.php: ' + e.message);
                    me.vehiclesGrid.setLoading(false);
                }
            },
            failure: function(response) {
                console.error('[M25] Ошибка tree.php:', response.status);
                me.showError('Ошибка загрузки списка ТС (статус ' + response.status + ')');
                me.vehiclesGrid.setLoading(false);
            }
        });
    },

    // Извлечение массива узлов из ответа tree.php (универсально)
    extractNodesArray: function(data) {
        if (Ext.isArray(data)) return data;
        if (data && Ext.isArray(data.objects)) return data.objects;
        if (data && Ext.isArray(data.data)) return data.data;
        if (data && Ext.isArray(data.items)) return data.items;
        if (data && Ext.isArray(data.children)) return data.children;
        if (data && data.root && Ext.isArray(data.root.children)) return data.root.children;
        return null;
    },

    // Извлечение массива данных из current_data.php
    extractDataArray: function(data) {
        if (Ext.isArray(data)) return data;
        if (data && Ext.isArray(data.objects)) return data.objects;
        if (data && Ext.isArray(data.data)) return data.data;
        if (data && Ext.isArray(data.items)) return data.items;
        return null;
    },

    // Рекурсивный обход узлов и сбор ТС
    extractVehiclesFromNodes: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            // Проверяем, является ли узел ТС
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
                        equipment: me.extractField(node, ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker']),
                        imei: me.extractField(node, ['imei', 'serial', 'device_id', 'tracker_serial']),
                        model: me.extractField(node, ['model', 'vehicle_model', 'car_model']),
                        agent_id: me.extractField(node, ['agent_id', 'agentId', 'agent', 'driver_id'])
                    });
                }
            } else if (node.children && node.children.length) {
                var childVehicles = me.extractVehiclesFromNodes(node.children);
                result = result.concat(childVehicles);
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
    },

    showError: function(msg) {
        Ext.Msg.alert('Ошибка', msg + '. Подробности в консоли (F12)');
    }
});
