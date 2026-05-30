/**
 * MainPanel.js — правая панель с iframe и информацией о датчиках.
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'border',   // разделяем на верхнюю (инфо) и центральную (iframe)
    title: (typeof l === 'function') ? l('M25 Monitor — данные объекта') : 'M25 Monitor — данные объекта',

    currentIframeSrc: 'about:blank',
    iframe: null,
    sensorGrid: null,

    initComponent: function() {
        // Создаём верхнюю панель с данными о ТС и датчиках
        this.createSensorPanel();
        // Создаём iframe
        this.createIframe();
        
        this.items = [
            this.sensorPanel,
            this.iframe
        ];
        this.callParent(arguments);
    },

    createSensorPanel: function() {
        // Панель с краткой информацией о ТС
        this.infoPanel = Ext.create('Ext.panel.Panel', {
            region: 'north',
            height: 250,
            collapsible: true,
            title: (typeof l === 'function') ? l('Данные транспортного средства') : 'Данные ТС',
            layout: 'fit',
            items: [this.createSensorGrid()]
        });
        this.sensorPanel = this.infoPanel;
    },

    createSensorGrid: function() {
        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: []
        });
        this.sensorGrid = Ext.create('Ext.grid.Panel', {
            store: this.sensorStore,
            columns: [
                { text: (typeof l === 'function') ? l('Параметр') : 'Параметр', dataIndex: 'param', flex: 2 },
                { text: (typeof l === 'function') ? l('Значение') : 'Значение', dataIndex: 'value', flex: 2 },
                { text: (typeof l === 'function') ? l('Ед. изм.') : 'Ед. изм.', dataIndex: 'unit', flex: 1 }
            ],
            viewConfig: { emptyText: (typeof l === 'function') ? l('Выберите ТС для отображения датчиков') : 'Выберите ТС' },
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    {
                        text: (typeof l === 'function') ? l('Обновить датчики') : 'Обновить датчики',
                        iconCls: 'fa fa-sync',
                        handler: this.refreshSensors,
                        scope: this
                    }
                ]
            }]
        });
        return this.sensorGrid;
    },

    createIframe: function() {
        var me = this;
        this.iframe = Ext.create('Ext.Component', {
            region: 'center',
            autoEl: {
                tag: 'iframe',
                src: this.currentIframeSrc,
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() {
                var el = this.getEl();
                return el ? el.dom : null;
            }
        });
    },

    // Главный метод, вызываемый из Navigation при выборе ТС
    loadVehicleData: function(vehid, vehicleName, imei, equipment, externalUrl) {
        this.currentVehicle = { vehid: vehid, name: vehicleName, imei: imei, equipment: equipment };
        this.currentIframeSrc = externalUrl;
        
        // Обновляем заголовок панели
        this.setTitle((typeof l === 'function') ? l('M25 Monitor — ') + vehicleName : 'M25 Monitor — ' + vehicleName);
        
        // Загружаем iframe
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) iframeDom.src = externalUrl;
        
        // Загружаем данные датчиков
        this.refreshSensors();
    },

    // Запрос текущих данных ТС через /ax/current_data.php
    refreshSensors: function() {
        var me = this;
        if (!me.currentVehicle || !me.currentVehicle.vehid) {
            me.sensorStore.loadData([]);
            return;
        }
        var vehid = me.currentVehicle.vehid;
        me.sensorGrid.setLoading(true);
        
        // Эндпоинт для получения текущих данных всех ТС (или одного)
        Ext.Ajax.request({
            url: '/ax/current_data.php',
            params: { vehid: vehid },   // можно передать ID конкретного ТС
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    // Структура ответа может быть разной: { objects: [...] } или массив
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
                        me.displaySensors(vehicleData);
                    } else {
                        me.sensorStore.loadData([{ param: 'Статус', value: 'Нет данных', unit: '' }]);
                    }
                } catch(e) {
                    console.error('[M25] Ошибка парсинга current_data', e);
                    me.sensorStore.loadData([{ param: 'Ошибка', value: e.message, unit: '' }]);
                }
                me.sensorGrid.setLoading(false);
            },
            failure: function() {
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить данные', unit: '' }]);
                me.sensorGrid.setLoading(false);
            }
        });
    },

    // Отображение полученных данных (датчики, параметры)
    displaySensors: function(vehicleData) {
        var records = [];
        // Основные поля
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Оборудование', value: vehicleData.equipment, unit: '' });
        
        // Датчики: обычно находятся в vehicleData.sensors или в полях типа fuel, ignition, etc.
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
        
        // Распространённые стандартные поля
        var commonFields = {
            'fuel': 'Топливо',
            'ignition': 'Зажигание',
            'speed': 'Скорость',
            'mileage': 'Пробег',
            'engine_hours': 'Моточасы',
            'temperature': 'Температура'
        };
        for (var key in commonFields) {
            if (vehicleData[key] !== undefined) {
                records.push({ param: commonFields[key], value: vehicleData[key], unit: (key === 'speed' ? 'км/ч' : (key === 'fuel' ? 'л' : '')) });
            }
        }
        
        if (records.length === 0) {
            records.push({ param: 'Информация', value: 'Нет дополнительных датчиков', unit: '' });
        }
        this.sensorStore.loadData(records);
    },

    // Упрощённый метод для совместимости со старым Navigation
    loadUrl: function(url, vehicleName) {
        this.loadVehicleData(null, vehicleName, null, null, url);
    },

    reset: function() {
        this.currentVehicle = null;
        this.setTitle((typeof l === 'function') ? l('M25 Monitor — внешняя страница') : 'M25 Monitor');
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) iframeDom.src = 'about:blank';
        this.sensorStore.loadData([]);
    }
});
