/**
 * MainPanel.js — правая панель с iframe, датчиками и выбором ТС.
 * Содержит тулбар с комбобоксом всех M25 устройств.
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'border',
    title: (typeof l === 'function') ? l('M25 Monitor — данные объекта') : 'M25 Monitor',

    currentIframeSrc: 'about:blank',
    currentVehicle: null,   // { vehid, name, imei, equipment }
    iframe: null,
    sensorGrid: null,
    vehicleCombo: null,
    vehicleStore: null,     // хранилище для комбобокса

    initComponent: function() {
        this.createTopToolbar();      // тулбар с комбобоксом
        this.createSensorPanel();     // панель датчиков (север)
        this.createIframe();          // iframe (центр)

        this.items = [
            this.sensorPanel,
            this.iframe
        ];
        this.dockedItems = [this.topToolbar];
        this.callParent(arguments);

        // Загружаем список M25 устройств
        this.loadVehicleList();
    },

    /**
     * Верхний тулбар с комбобоксом и кнопками
     */
    createTopToolbar: function() {
        var me = this;

        // Хранилище для комбобокса
        this.vehicleStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'text', 'imei', 'equipment'],
            data: []
        });

        this.vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: (typeof l === 'function') ? l('Транспортное средство') : 'ТС',
            labelWidth: 100,
            width: 350,
            store: this.vehicleStore,
            queryMode: 'local',
            displayField: 'text',
            valueField: 'vehid',
            editable: true,
            typeAhead: true,
            forceSelection: false,
            emptyText: (typeof l === 'function') ? l('Выберите или начните ввод...') : 'Выберите...',
            listeners: {
                select: function(combo, record) {
                    me.onVehicleSelected(record.data);
                },
                scope: me
            }
        });

        this.topToolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                this.vehicleCombo,
                {
                    text: (typeof l === 'function') ? l('Обновить список') : 'Обновить',
                    iconCls: 'fa fa-sync-alt',
                    handler: function() { me.loadVehicleList(); },
                    scope: me
                },
                '->',
                {
                    text: (typeof l === 'function') ? l('Обновить iframe') : 'Обновить iframe',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            var iframeDom = me.iframe.getIframeDom();
                            if (iframeDom) iframeDom.src = me.currentIframeSrc;
                        }
                    }
                },
                {
                    text: (typeof l === 'function') ? l('Открыть в новом окне') : 'Открыть в окне',
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert('Информация', 'Сначала выберите ТС');
                        }
                    }
                }
            ]
        });
    },

    /**
     * Панель с датчиками (северная область)
     */
    createSensorPanel: function() {
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
            height: 200,
            collapsible: true,
            title: (typeof l === 'function') ? l('Датчики и параметры') : 'Датчики',
            viewConfig: { emptyText: (typeof l === 'function') ? l('Выберите ТС для отображения датчиков') : 'Выберите ТС' },
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [{
                    text: (typeof l === 'function') ? l('Обновить датчики') : 'Обновить',
                    iconCls: 'fa fa-chart-line',
                    handler: this.refreshSensors,
                    scope: this
                }]
            }]
        });
        this.sensorPanel = this.sensorGrid;
    },

    /**
     * Iframe для внешней страницы (центральная область)
     */
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

    /**
     * Загрузка списка всех M25 устройств из PILOT (через /ax/tree.php)
     */
    loadVehicleList: function() {
        var me = this;
        me.vehicleCombo.setLoading(true);
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    var vehicles = me.extractAllM25Vehicles(data);
                    me.vehicleStore.loadData(vehicles);
                    if (vehicles.length === 0) {
                        Ext.Msg.alert('Информация', 'Устройства с M25 не найдены');
                    }
                } catch(e) {
                    console.error(e);
                }
                me.vehicleCombo.setLoading(false);
            },
            failure: function() {
                me.vehicleCombo.setLoading(false);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС');
            }
        });
    },

    /**
     * Рекурсивный сбор всех транспортных средств, у которых оборудование содержит "m25"
     */
    extractAllM25Vehicles: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = me.extractEquipment(node);
            var hasM25 = equipment && equipment.toLowerCase().indexOf('m25') !== -1;
            if (isVehicle && hasM25) {
                result.push({
                    vehid: node.vehid,
                    text: node.text || node.name || 'Без имени',
                    imei: me.extractImei(node),
                    equipment: equipment
                });
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractAllM25Vehicles(node.children));
            }
        });
        return result;
    },

    // Аналогичные методы extractEquipment и extractImei, как в Navigation.js
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
        var imeiCandidates = ['imei', 'serial', 'device_id', 'tracker_serial'];
        for (var i = 0; i < imeiCandidates.length; i++) {
            var val = node[imeiCandidates[i]];
            if (val && typeof val === 'string' && val.trim() !== '') return val;
        }
        return '';
    },

    /**
     * Обработчик выбора ТС из комбобокса
     */
    onVehicleSelected: function(vehicle) {
        if (!vehicle || !vehicle.vehid) return;
        this.currentVehicle = vehicle;

        // Формируем URL внешней страницы
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehicle.vehid);
        this.currentIframeSrc = url;

        // Загружаем iframe
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) iframeDom.src = url;

        // Обновляем датчики
        this.refreshSensors();

        // Обновляем заголовок панели
        this.setTitle((typeof l === 'function') ? l('M25 Monitor — ') + vehicle.text : vehicle.text);
    },

    /**
     * Получение текущих данных ТС через /ax/current_data.php
     */
    refreshSensors: function() {
        var me = this;
        if (!me.currentVehicle || !me.currentVehicle.vehid) {
            me.sensorStore.loadData([]);
            return;
        }
        var vehid = me.currentVehicle.vehid;
        me.sensorGrid.setLoading(true);
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
                    me.displaySensors(vehicleData);
                } catch(e) {
                    console.error(e);
                    me.sensorStore.loadData([{ param: 'Ошибка', value: e.message, unit: '' }]);
                }
                me.sensorGrid.setLoading(false);
            },
            failure: function() {
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Нет данных', unit: '' }]);
                me.sensorGrid.setLoading(false);
            }
        });
    },

    displaySensors: function(vehicleData) {
        var records = [];
        if (!vehicleData) {
            this.sensorStore.loadData([{ param: 'Статус', value: 'Нет данных от PILOT', unit: '' }]);
            return;
        }
        // Основные поля
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Оборудование', value: vehicleData.equipment, unit: '' });
        
        // Датчики из массива sensors
        var sensors = vehicleData.sensors || [];
        Ext.Array.each(sensors, function(s) {
            records.push({
                param: s.name || s.label || 'Датчик',
                value: s.value !== undefined ? s.value : '—',
                unit: s.unit || ''
            });
        });
        
        // Стандартные поля
        var common = {
            fuel: 'Топливо',
            ignition: 'Зажигание',
            speed: 'Скорость',
            mileage: 'Пробег',
            engine_hours: 'Моточасы',
            temperature: 'Температура'
        };
        for (var key in common) {
            if (vehicleData[key] !== undefined) {
                records.push({ param: common[key], value: vehicleData[key], unit: (key === 'speed' ? 'км/ч' : (key === 'fuel' ? 'л' : '')) });
            }
        }
        if (records.length === 0) records.push({ param: 'Информация', value: 'Нет дополнительных датчиков', unit: '' });
        this.sensorStore.loadData(records);
    }
});
