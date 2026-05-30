/**
 * M25 Monitor — PILOT Extension
 * Показывает все транспортные средства в таблице, позволяет редактировать тип устройства,
 * загружает выбранный объект в iframe.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Хранилище типов устройств (vehid -> тип)
    deviceTypes: {},

    // Доступные опции для выпадающего списка
    deviceTypeOptions: ['M25', 'M30', 'M40', 'Другое'],

    // Безопасная локализация
    l: function(text) {
        return (typeof l === 'function') ? l(text) : text;
    },

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация...');

        // Проверяем skeleton
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('[M25] Skeleton не готов, повтор через 500ms');
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Загружаем сохранённые типы из localStorage
        me.loadSavedTypes();

        // Создаём главную панель (iframe + тулбар)
        var mainPanel = me.createMainPanel();

        // Создаём левую панель с таблицей (grid)
        var leftPanel = me.createLeftPanel();

        // Оборачиваем левую панель в LeftBarPanel (требование PILOT)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: me.l('M25 Monitor'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [leftPanel]
        });

        // Связываем левую и правую панели
        navTab.map_frame = mainPanel;

        // Добавляем в интерфейс PILOT
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Инициализация завершена');
    },

    // Загрузка сохранённых типов из localStorage
    loadSavedTypes: function() {
        var stored = localStorage.getItem('m25_monitor_device_types');
        this.deviceTypes = stored ? Ext.decode(stored) : {};
    },

    // Сохранение типов в localStorage
    saveTypesToLocal: function() {
        localStorage.setItem('m25_monitor_device_types', Ext.encode(this.deviceTypes));
        Ext.Msg.alert(this.l('Сохранено'), this.l('Типы устройств сохранены'));
    },

    // Сброс всех типов
    resetAllTypes: function() {
        var me = this;
        Ext.Msg.confirm(this.l('Сброс'), this.l('Сбросить все типы устройств к значениям из API?'), function(btn) {
            if (btn === 'yes') {
                me.deviceTypes = {};
                me.saveTypesToLocal();
                me.refreshGrid();
            }
        });
    },

    // Обновление таблицы (перезагрузка данных)
    refreshGrid: function() {
        if (this.gridPanel && this.gridPanel.getStore()) {
            this.loadAllVehicles(this.gridPanel.getStore());
        }
    },

    // Создание левой панели с гридом
    createLeftPanel: function() {
        var me = this;

        // Хранилище для таблицы
        var store = Ext.create('Ext.data.Store', {
            fields: ['id', 'text', 'vehid', 'imei', 'deviceType'],
            data: [],
            sorters: [{ property: 'text', direction: 'ASC' }]
        });

        // Редактирование ячеек (только колонка "Тип устройства")
        var cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
            clicksToEdit: 2,
            listeners: {
                beforeedit: function(editor, context) {
                    return context.column.dataIndex === 'deviceType';
                },
                edit: function(editor, context) {
                    var record = context.record;
                    var newValue = context.value;
                    var vehid = record.get('vehid');
                    if (!vehid) return;

                    if (newValue) {
                        me.deviceTypes[vehid] = newValue;
                    } else {
                        delete me.deviceTypes[vehid];
                    }
                    record.set('deviceType', newValue);
                    me.saveTypesToLocal();
                }
            }
        });

        // Таблица
        var grid = Ext.create('Ext.grid.Panel', {
            store: store,
            columns: [
                { text: me.l('Объект'), dataIndex: 'text', flex: 2, sortable: true },
                { text: me.l('IMEI'), dataIndex: 'imei', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } },
                {
                    text: me.l('Тип устройства'),
                    dataIndex: 'deviceType',
                    flex: 1.5,
                    sortable: true,
                    editor: {
                        xtype: 'combobox',
                        store: me.deviceTypeOptions,
                        queryMode: 'local',
                        editable: true,
                        forceSelection: false,
                        triggerAction: 'all'
                    },
                    renderer: function(value) {
                        return value ? Ext.String.htmlEncode(value) : '—';
                    }
                }
            ],
            plugins: [cellEditing],
            tbar: [
                { text: me.l('Сохранить типы'), iconCls: 'fa fa-save', handler: me.saveTypesToLocal, scope: me },
                { text: me.l('Сбросить все типы'), iconCls: 'fa fa-undo', handler: me.resetAllTypes, scope: me },
                '->',
                { text: me.l('Обновить список'), iconCls: 'fa fa-refresh', handler: me.refreshGrid, scope: me }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                scope: me
            }
        });

        this.gridPanel = grid;
        this.loadAllVehicles(store);

        // Оборачиваем грид в обычную панель (чтобы он растягивался)
        return Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            border: false,
            items: [grid]
        });
    },

    // Загрузка всех ТС из PILOT (через /ax/tree.php)
    loadAllVehicles: function(store) {
        var me = this;
        console.log('[M25] Загрузка устройств...');
        me.gridPanel.setLoading(true);

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    // Извлекаем все транспортные средства из иерархического дерева
                    var vehicles = me.extractVehiclesFromTree(data);
                    var records = [];
                    Ext.Array.each(vehicles, function(veh) {
                        records.push(me.normalizeVehicleRecord(veh));
                    });
                    store.loadData(records);
                    console.log('[M25] Загружено устройств:', records.length);
                } catch (e) {
                    console.error('[M25] Ошибка парсинга', e);
                    Ext.Msg.alert(me.l('Ошибка'), me.l('Не удалось загрузить список устройств'));
                }
                me.gridPanel.setLoading(false);
            },
            failure: function() {
                me.gridPanel.setLoading(false);
                Ext.Msg.alert(me.l('Ошибка'), me.l('Ошибка соединения с PILOT API'));
            }
        });
    },

    // Рекурсивный обход дерева для извлечения всех объектов с типом "veh"
    extractVehiclesFromTree: function(nodes) {
        var result = [];
        Ext.Array.each(nodes, function(node) {
            if (node.type === 'veh' || node.vehid) {
                result.push(node);
            }
            if (node.children && node.children.length) {
                result = result.concat(this.extractVehiclesFromTree(node.children));
            }
        }, this);
        return result;
    },

    // Нормализация записи ТС для отображения в гриде
    normalizeVehicleRecord: function(vehicle) {
        var vehid = vehicle.vehid || vehicle.id;
        var savedType = this.deviceTypes[vehid];
        var apiType = vehicle.model || vehicle.equipment || vehicle.hardware || vehicle.device_type || '';
        // Если сохранённый тип есть – используем его, иначе пытаемся определить из API
        var displayType = (savedType !== undefined) ? savedType :
            (this.deviceTypeOptions.indexOf(apiType) !== -1 ? apiType : '');
        return {
            id: vehid,
            text: vehicle.text || vehicle.name || this.l('Без имени'),
            vehid: vehid,
            imei: vehicle.imei || '',
            deviceType: displayType
        };
    },

    // Создание правой панели с iframe
    createMainPanel: function() {
        var me = this;

        // iframe компонент
        var iframe = Ext.create('Ext.Component', {
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

        // Тулбар с кнопками
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: me.l('Обновить iframe'),
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            var iframeEl = iframe.getIframeDom();
                            if (iframeEl) iframeEl.src = me.currentIframeSrc;
                        } else {
                            Ext.Msg.alert(me.l('Информация'), me.l('Сначала выберите объект.'));
                        }
                    }
                },
                {
                    text: me.l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert(me.l('Информация'), me.l('Сначала выберите объект.'));
                        }
                    }
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#888;">' + me.l('Выберите устройство в левой панели') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: me.l('Информация об устройстве (внешняя страница)'),
            tbar: toolbar,
            items: [iframe]
        });

        mainPanel.iframe = iframe;
        me.currentIframeSrc = 'about:blank';
        return mainPanel;
    },

    // Обработка выбора ТС в таблице
    onVehicleSelected: function(record) {
        var me = this;
        var mainPanel = me.mainPanel;
        if (!mainPanel) {
            // Если mainPanel ещё не сохранён, найдём его
            mainPanel = Ext.ComponentQuery.query('panel[title*="внешняя страница"]')[0];
            if (!mainPanel) return;
            me.mainPanel = mainPanel;
        }

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;
        if (vehid) {
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        var iframeDom = mainPanel.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = url;
            me.currentIframeSrc = url;
        }

        var infoText = mainPanel.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">' + me.l('Текущее устройство: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('[M25] Выбрано устройство:', vehicleName, 'ID:', vehid);
    }
});
