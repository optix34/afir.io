/**
 * MainPanel.js — правая панель с выпадающим списком ТС, датчиками и iframe.
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'border',
    title: (typeof l === 'function') ? l('M25 Monitor — выбор ТС') : 'M25 Monitor',

    currentVehicleId: null,
    currentVehicleName: null,
    iframe: null,
    sensorGrid: null,
    vehicleCombo: null,

    initComponent: function() {
        this.createTopPanel();   // панель с комбобоксом и датчиками
        this.createIframe();     // iframe в центре

        this.items = [
            this.topPanel,   // region: north
            this.iframe      // region: center
        ];
        this.callParent(arguments);
    },

    // Верхняя область: выбор ТС + таблица датчиков
    createTopPanel: function() {
        var me = this;

        // Создаём комбобокс для выбора ТС
        this.vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: (typeof l === 'function') ? l('Транспортное средство') : 'ТС',
            labelWidth: 120,
            width: 400,
            queryMode: 'local',
            displayField: 'text',
            valueField: 'vehid',
            editable: true,
            forceSelection: false,
            triggerAction: 'all',
            emptyText: (typeof l === 'function') ? l('Выберите или начните вводить...') : 'Выберите...',
            listeners: {
                select: function(combo, records) {
                    if (records && records.length) {
                        var record = records[0];
                        me.onVehicleSelected(record);
                    }
                },
                scope: me
            }
        });

        // Кнопка обновления списка ТС
        var refreshBtn = Ext.create('Ext.button.Button', {
            text: (typeof l === 'function') ? l('Обновить список') : 'Обновить',
            iconCls: 'fa fa-sync-alt',
            handler: function() {
                me.loadVehiclesList();
            },
            scope: me
        });

        // Панель инструментов с комбобоксом и кнопкой
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            items: [
                this.vehicleCombo,
                refreshBtn,
                '->',
                {
                    xtype: 'component',
                    html: '<span class="m25-monitor-info">' + ((typeof l === 'function') ? l('Выберите ТС для просмотра') : 'Выберите ТС') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });

        // Таблица датчиков
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
            title: (typeof l === 'function') ? l('Датчики и параметры') : 'Данные ТС',
            collapsible: true,
            collapsed: false,
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    {
                        text: (typeof l === 'function') ? l('Обновить датчики') : 'Обновить',
                        iconCls: 'fa fa-sync',
                        handler: this.refreshSensors,
                        scope: this
                    }
                ]
            }]
        });

        this.topPanel = Ext.create('Ext.panel.Panel', {
            region: 'north',
            layout: 'vbox',
            border: false,
            items: [toolbar, this.sensorGrid]
        });

        // Загружаем список ТС сразу после создания
        this.loadVehiclesList();
    },

    // Загрузка списка ТС из PILOT с фильтром M25
    loadVehiclesList: function() {
        var me = this;
        this.vehicleCombo.setLoading(true);
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    var vehicles = me.extractM25Vehicles(data);
                    me.vehicleCombo.store.loadData(vehicles);
                    if (vehicles.length === 0) {
                        Ext.Msg.alert((typeof l === 'function') ? l('Информация') : 'Информация',
                            (typeof l === 'function') ? l('Объекты с оборудованием M25 не найдены.') : 'Нет M25 устройств');
                    } else {
                        console.log('[M25] Загружено M25 ТС:', vehicles.length);
                    }
                } catch(e) {
                    console.error('[M25] Ошибка списка ТС', e);
                }
                me.vehicleCombo.setLoading(false);
            },
            failure: function() {
                me.vehicleCombo.setLoading(false);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС');
            }
        });
    },

    // Рекурсивный обход дерева PILOT, сбор только ТС c M25
    extractM25Vehicles: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = me.extractEquipment(node);
            var hasM25 = equipment && equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle && hasM25) {
                result.push({
                    vehid: node.vehid,
                    text: node.text || node.name || (typeof l === 'function' ? l('Без имени') : 'Без имени'),
                    imei: me.extractImei(node),
                    equipment: equipment
                });
            } else if (node.children && node.children.length) {
                result = result.concat(me.extractM25Vehicles(node.children));
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

    // Когда пользователь выбрал ТС из комбобокса
    onVehicleSelected: function(record) {
        this.currentVehicleId = record.get('vehid');
        this.currentVehicleName = record.get('text');

        // Обновляем информационную строку
        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span class="m25-monitor-info">' +
                ((typeof l === 'function') ? l('Выбран: ') : 'Выбран: ') +
                Ext.String.htmlEncode(this.currentVehicleName) + '</span>');
        }

        // Загружаем внешнюю страницу в iframe
        var url = 'https://mega-info.su/dealer2/?vehicle_id=' + encodeURIComponent(this.currentVehicleId);
        this.loadIframe(url);

        // Загружаем датчики
        this.refreshSensors();
    },

    loadIframe: function(url) {
        if (!this.iframe) return;
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = url;
        }
    },

    refreshSensors: function() {
        var me = this;
        if (!me.currentVehicleId) {
            me.sensorStore.loadData([]);
            return;
        }
        me.sensorGrid.setLoading(true);
        Ext.Ajax.request({
            url: '/ax/current_data.php',
            params: { vehid: me.currentVehicleId },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    var vehicles = data.objects || data.data || (Ext.isArray(data) ? data : []);
                    var vehicleData = null;
                    if (Ext.isArray(vehicles)) {
                        vehicleData = Ext.Array.findBy(vehicles, function(v) {
                            return v.vehid == me.currentVehicleId || v.id == me.currentVehicleId;
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
                    console.error('[M25] Ошибка датчиков', e);
                }
                me.sensorGrid.setLoading(false);
            },
            failure: function() {
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить', unit: '' }]);
                me.sensorGrid.setLoading(false);
            }
        });
    },

    displaySensors: function(vehicleData) {
        var records = [];
        if (vehicleData.name) records.push({ param: 'Название', value: vehicleData.name, unit: '' });
        if (vehicleData.imei) records.push({ param: 'IMEI', value: vehicleData.imei, unit: '' });
        if (vehicleData.model) records.push({ param: 'Модель', value: vehicleData.model, unit: '' });
        if (vehicleData.equipment) records.push({ param: 'Оборудование', value: vehicleData.equipment, unit: '' });

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

        var commonFields = {
            'fuel': 'Топливо',
            'ignition': 'Зажигание',
            'speed': 'Скорость',
            'mileage': 'Пробег',
            'engine_hours': 'Моточасы'
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

    createIframe: function() {
        var me = this;
        this.iframe = Ext.create('Ext.Component', {
            region: 'center',
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
    }
});
