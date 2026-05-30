/**
 * MainPanel.js — правая панель с комбобоксом выбора ТС, датчиками и iframe.
 * Использует официальные API PILOT:
 *   - /api/api.php?cmd=list&node=1  — список транспортных средств
 *   - /api/api.php?cmd=sensors&imei=XXX&node=1&start=...&stop=... — датчики
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'border',
    title: 'M25 Monitor — данные объекта',

    // Хранилища и компоненты
    currentIframeSrc: 'about:blank',
    currentVehicle: null,
    iframe: null,
    sensorGrid: null,
    vehicleCombo: null,
    vehicleStore: null,

    initComponent: function () {
        this.createTopToolbar();      // тулбар с комбобоксом
        this.createSensorPanel();     // панель датчиков (север)
        this.createIframe();          // iframe (центр)

        this.items = [
            this.sensorPanel,
            this.iframe
        ];
        this.dockedItems = [this.topToolbar];
        this.callParent(arguments);

        // Загружаем список ТС при старте
        this.loadVehicleList();
    },

    /**
     * Верхний тулбар: комбобокс + кнопки обновления
     */
    createTopToolbar: function () {
        var me = this;

        this.vehicleStore = Ext.create('Ext.data.Store', {
            fields: ['vehid', 'text', 'imei', 'equipment'],
            data: []
        });

        this.vehicleCombo = Ext.create('Ext.form.field.ComboBox', {
            fieldLabel: 'Транспортное средство',
            labelWidth: 100,
            width: 350,
            store: this.vehicleStore,
            queryMode: 'local',
            displayField: 'text',
            valueField: 'vehid',
            editable: true,
            typeAhead: true,
            forceSelection: false,
            emptyText: 'Выберите или начните ввод...',
            listeners: {
                select: function (combo, record) {
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
                    text: 'Обновить список',
                    iconCls: 'fa fa-sync-alt',
                    handler: function () { me.loadVehicleList(); },
                    scope: me
                },
                '->',
                {
                    text: 'Обновить iframe',
                    iconCls: 'fa fa-refresh',
                    handler: function () {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            var iframeDom = me.iframe.getIframeDom();
                            if (iframeDom) iframeDom.src = me.currentIframeSrc;
                        }
                    }
                },
                {
                    text: 'Открыть в новом окне',
                    iconCls: 'fa fa-external-link',
                    handler: function () {
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
     * Панель с сеткой датчиков (северная область)
     */
    createSensorPanel: function () {
        this.sensorStore = Ext.create('Ext.data.Store', {
            fields: ['param', 'value', 'unit'],
            data: [{ param: 'Статус', value: 'Выберите ТС из списка', unit: '' }]
        });

        this.sensorGrid = Ext.create('Ext.grid.Panel', {
            store: this.sensorStore,
            columns: [
                { text: 'Параметр', dataIndex: 'param', flex: 2 },
                { text: 'Значение', dataIndex: 'value', flex: 2 },
                { text: 'Ед. изм.', dataIndex: 'unit', flex: 1 }
            ],
            height: 200,
            collapsible: true,
            title: 'Датчики и параметры',
            viewConfig: { emptyText: 'Выберите ТС для отображения датчиков' },
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [{
                    text: 'Обновить датчики',
                    iconCls: 'fa fa-chart-line',
                    handler: this.refreshSensors,
                    scope: this
                }]
            }]
        });
        this.sensorPanel = this.sensorGrid;
    },

    /**
     * Iframe для отображения внешней страницы (центральная область)
     */
    createIframe: function () {
        var me = this;
        this.iframe = Ext.create('Ext.Component', {
            region: 'center',
            autoEl: {
                tag: 'iframe',
                src: this.currentIframeSrc,
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function () {
                var el = this.getEl();
                return el ? el.dom : null;
            }
        });
    },

    /**
     * Загрузка списка всех ТС через API /api/api.php?cmd=list&node=1
     * Фильтрация по оборудованию M25 (поиск подстроки 'm25' в поле extra_params.make_model)
     */
    loadVehicleList: function () {
        var me = this;
        me.vehicleCombo.setLoading(true);

        Ext.Ajax.request({
            url: '/api/api.php?cmd=list&node=1',
            method: 'GET',
            success: function (response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    if (resp.code === 0 && resp.list) {
                        var vehicles = [];
                        Ext.Array.each(resp.list, function (vehicle) {
                            var imei = vehicle.imei || '';
                            var equipment = '';
                            // Модель оборудования может быть в extra_params.make_model или в другом поле
                            if (vehicle.extra_params && vehicle.extra_params.make_model) {
                                equipment = vehicle.extra_params.make_model;
                            }
                            // Фильтр: если поле equipment содержит "m25" (регистронезависимо) – добавляем
                            if (equipment && equipment.toLowerCase().indexOf('m25') !== -1) {
                                vehicles.push({
                                    vehid: vehicle.agentid,
                                    text: vehicle.vehiclenumber || vehicle.type || 'Без имени',
                                    imei: imei,
                                    equipment: equipment
                                });
                            } else if (!equipment) {
                                // Если поле equipment не определено, всё равно показываем ТС (для отладки)
                                // Можно убрать эту строку, если нужна строгая фильтрация
                                vehicles.push({
                                    vehid: vehicle.agentid,
                                    text: vehicle.vehiclenumber || vehicle.type || 'Без имени',
                                    imei: imei,
                                    equipment: equipment || 'не указано'
                                });
                            }
                        });
                        me.vehicleStore.loadData(vehicles);
                        if (vehicles.length === 0) {
                            Ext.Msg.alert('Информация', 'Устройства с оборудованием M25 не найдены. Проверьте консоль.');
                        }
                    } else {
                        Ext.Msg.alert('Ошибка', 'Ошибка получения списка ТС: ' + (resp.msg || 'неизвестная ошибка'));
                    }
                } catch (e) {
                    console.error('[M25] Ошибка парсинга ответа /api/api.php?cmd=list', e);
                    Ext.Msg.alert('Ошибка', 'Некорректный ответ сервера при загрузке списка ТС');
                }
                me.vehicleCombo.setLoading(false);
            },
            failure: function (response) {
                console.error('[M25] AJAX ошибка при загрузке списка ТС', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список ТС. Статус: ' + response.status);
                me.vehicleCombo.setLoading(false);
            }
        });
    },

    /**
     * Обработчик выбора ТС из комбобокса
     */
    onVehicleSelected: function (vehicle) {
        if (!vehicle || !vehicle.vehid) return;
        this.currentVehicle = vehicle;

        // Формируем URL для внешнего сервиса
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehicle.vehid);
        this.currentIframeSrc = url;

        // Загружаем iframe
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) iframeDom.src = url;

        // Загружаем датчики
        this.refreshSensors();

        // Меняем заголовок панели
        this.setTitle('M25 Monitor — ' + vehicle.text);
    },

    /**
     * Получение данных датчиков через API /api/api.php?cmd=sensors&imei=...
     * Параметры: imei, node (обычно 1), start и stop (unix timestamp)
     */
    refreshSensors: function () {
        var me = this;
        if (!me.currentVehicle || !me.currentVehicle.vehid) {
            me.sensorStore.loadData([{ param: 'Статус', value: 'Выберите ТС из списка', unit: '' }]);
            return;
        }

        var imei = me.currentVehicle.imei;
        if (!imei) {
            me.sensorStore.loadData([{ param: 'Ошибка', value: 'IMEI не найден для этого ТС', unit: '' }]);
            return;
        }

        var node = 1; // Обычно 1 – основной узел
        var now = Math.floor(Date.now() / 1000);
        var weekAgo = now - 7 * 86400; // данные за последние 7 дней

        me.sensorGrid.setLoading(true);
        Ext.Ajax.request({
            url: '/api/api.php?cmd=sensors&imei=' + encodeURIComponent(imei) + '&node=' + node + '&start=' + weekAgo + '&stop=' + now,
            method: 'GET',
            success: function (response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    if (resp && resp.sensors) {
                        var records = [];
                        // Добавляем общую информацию о ТС
                        records.push({ param: 'Название', value: me.currentVehicle.text, unit: '' });
                        records.push({ param: 'IMEI', value: me.currentVehicle.imei, unit: '' });
                        records.push({ param: 'Оборудование', value: me.currentVehicle.equipment || '—', unit: '' });

                        // Обрабатываем каждый датчик из ответа
                        for (var sensorId in resp.sensors) {
                            var sensor = resp.sensors[sensorId];
                            var workData = sensor.work;
                            var lastWork = null;
                            // Находим последнюю запись о работе датчика
                            for (var startTs in workData) {
                                if (workData[startTs]) {
                                    lastWork = workData[startTs];
                                }
                            }
                            if (lastWork) {
                                var startDate = new Date(lastWork.ts * 1000).toLocaleString();
                                var endDate = lastWork.te ? new Date(lastWork.te * 1000).toLocaleString() : '...';
                                records.push({
                                    param: sensor.info || sensor.fieldname || sensorId,
                                    value: startDate + ' — ' + endDate,
                                    unit: ''
                                });
                            } else {
                                records.push({
                                    param: sensor.info || sensor.fieldname || sensorId,
                                    value: 'Нет активности за выбранный период',
                                    unit: ''
                                });
                            }
                        }
                        if (records.length === 3) { // только общие поля, датчиков нет
                            records.push({ param: 'Информация', value: 'Данные о работе датчиков не найдены', unit: '' });
                        }
                        me.sensorStore.loadData(records);
                    } else {
                        me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось получить данные датчиков', unit: '' }]);
                    }
                } catch (e) {
                    console.error('[M25] Ошибка парсинга ответа датчиков', e);
                    me.sensorStore.loadData([{ param: 'Ошибка', value: 'Ошибка обработки данных датчиков', unit: '' }]);
                }
                me.sensorGrid.setLoading(false);
            },
            failure: function (response) {
                console.error('[M25] AJAX ошибка при загрузке датчиков', response.status);
                me.sensorStore.loadData([{ param: 'Ошибка', value: 'Не удалось загрузить данные датчиков', unit: '' }]);
                me.sensorGrid.setLoading(false);
            }
        });
    }
});
