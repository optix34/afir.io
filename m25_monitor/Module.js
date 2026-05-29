/**
 * M25 Monitor - PILOT Extension
 * 
 * Отображает в левой навигации только объекты с оборудованием M25.
 * При выборе объекта в правой панели открывается iframe с https://mega-info.su/dealer2/
 * 
 * @class Store.m25_monitor.Module
 * @extends Ext.Component
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    /**
     * Имя расширения (должно совпадать с именем класса)
     */
    extensionName: 'm25_monitor',

    /**
     * Точка входа в расширение, вызывается PILOT после загрузки Module.js
     */
    initModule: function() {
        var me = this;

        console.log('M25 Monitor: initModule started');

        // Проверка наличия skeleton и необходимых контейнеров
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton, navigation or mapframe not found');
            return;
        }

        // 1. Создаём левую навигационную панель (вкладка)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [
                Ext.create('Ext.panel.Panel', {
                    layout: 'fit',
                    border: false,
                    items: me.createTreePanel()
                })
            ]
        });

        // 2. Создаём главную панель (правая область) с iframe
        var mainPanel = me.createMainPanel();

        // 3. Связываем навигацию с главной панелью (обязательное правило)
        navTab.map_frame = mainPanel;

        // 4. Добавляем вкладку в левую навигацию и панель в mapframe
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        // Сохраняем ссылку на mainPanel для доступа из дерева
        me.mainPanel = mainPanel;

        console.log('M25 Monitor: navigation and main panel added');
    },

    /**
     * Создаёт TreePanel с загрузкой и фильтрацией объектов M25
     * @return {Ext.tree.Panel}
     */
    createTreePanel: function() {
        var me = this;

        // Создаём TreeStore с корневым узлом
        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: 'M25 Devices',
                expanded: true,
                children: []
            },
            sorters: [{
                property: 'text',
                direction: 'ASC'
            }]
        });

        // Создаём TreePanel с колонками
        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                {
                    xtype: 'treecolumn',
                    text: 'Объект',
                    dataIndex: 'text',
                    flex: 2,
                    sortable: true
                },
                {
                    text: 'IMEI',
                    dataIndex: 'imei',
                    flex: 1,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                },
                {
                    text: 'Оборудование',
                    dataIndex: 'equipment',
                    flex: 1.5,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length > 0) {
                        var node = selected[0];
                        if (node && node.get('type') === 'veh') {
                            me.onVehicleSelected(node);
                        }
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') {
                        me.onVehicleSelected(record);
                    }
                },
                scope: me
            }
        });

        // Загружаем данные из PILOT
        me.loadM25Data(store, treePanel);
        me.treePanel = treePanel;

        return treePanel;
    },

    /**
     * Загружает /ax/current_data.php, фильтрует объекты с M25 и заполняет store
     * @param {Ext.data.TreeStore} store
     * @param {Ext.tree.Panel} treePanel
     */
    loadM25Data: function(store, treePanel) {
        var me = this;

        console.log('M25 Monitor: loading data from /ax/current_data.php');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    console.log('M25 Monitor: raw data received', data);

                    if (!Ext.isArray(data)) {
                        console.error('M25 Monitor: response is not an array', data);
                        Ext.Msg.alert('Ошибка', 'Получены некорректные данные от сервера.');
                        return;
                    }

                    // Фильтруем объекты с оборудованием M25
                    var filteredVehicles = me.filterM25Vehicles(data);
                    console.log('M25 Monitor: filtered vehicles', filteredVehicles);

                    // Преобразуем в формат дерева (плоский список под корнем)
                    var treeData = [{
                        text: 'M25 Devices',
                        expanded: true,
                        children: filteredVehicles
                    }];

                    store.setRoot({
                        children: treeData
                    });

                    if (filteredVehicles.length === 0) {
                        Ext.Msg.alert('Информация', 'Объекты с оборудованием M25 не найдены.');
                    }

                    // Принудительно обновляем вид дерева
                    if (treePanel && treePanel.getView) {
                        treePanel.getView().refresh();
                    }

                } catch (e) {
                    console.error('M25 Monitor: error parsing response', e);
                    Ext.Msg.alert('Ошибка', 'Некорректный ответ от сервера PILOT.');
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: failed to load /ax/current_data.php', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список объектов. Проверьте соединение.');
            },
            scope: me
        });
    },

    /**
     * Фильтрует массив транспортных средств, оставляя только те, у которых оборудование содержит "m25"
     * @param {Array} vehicles - массив объектов от /ax/current_data.php
     * @return {Array} - отфильтрованный массив узлов для дерева
     */
    filterM25Vehicles: function(vehicles) {
        var me = this;
        var result = [];

        Ext.Array.each(vehicles, function(vehicle) {
            var equipment = vehicle.equipment || vehicle.hardware || vehicle.model || '';
            if (equipment.toLowerCase().indexOf('m25') !== -1) {
                result.push(me.normalizeVehicleNode(vehicle));
            }
        });

        return result;
    },

    /**
     * Нормализует узел транспортного средства для TreeStore
     * @param {Object} vehicle - исходный объект из API
     * @return {Object} узел для дерева
     */
    normalizeVehicleNode: function(vehicle) {
        return {
            id: 'veh_' + (vehicle.vehid || vehicle.id),
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehicle.vehid || vehicle.id,
            imei: vehicle.imei || '',
            equipment: vehicle.equipment || '',
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    /**
     * Создаёт главную панель с iframe и тулбаром
     * @return {Ext.panel.Panel}
     */
    createMainPanel: function() {
        var me = this;

        // Создаём iframe
        var iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() {
                return this.getEl().dom;
            }
        });

        // Панель инструментов
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: 'Обновить',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        var iframeEl = iframe.getIframeDom();
                        if (iframeEl && me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            iframeEl.src = me.currentIframeSrc;
                        }
                    },
                    scope: me
                },
                {
                    text: 'Открыть в новом окне',
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert('Информация', 'Сначала выберите объект.');
                        }
                    },
                    scope: me
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#888;">Выберите объект в левой панели</span>',
                    itemId: 'infoText'
                }
            ]
        });

        // Основная панель
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: 'M25 Monitor — внешняя страница',
            tbar: toolbar,
            items: [iframe]
        });

        mainPanel.iframe = iframe;
        mainPanel.toolbar = toolbar;
        me.currentIframeSrc = 'about:blank';

        return mainPanel;
    },

    /**
     * Обработчик выбора транспортного средства
     * @param {Ext.data.NodeInterface} record
     */
    onVehicleSelected: function(record) {
        var me = this;
        var mainPanel = me.mainPanel;
        if (!mainPanel) return;

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');

        // Базовый URL внешней страницы
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;

        // Добавляем параметр vehicle_id, если есть vehid (опционально)
        if (vehid) {
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        // Обновляем iframe
        var iframe = mainPanel.iframe;
        if (iframe && iframe.getIframeDom) {
            var iframeDom = iframe.getIframeDom();
            if (iframeDom) {
                iframeDom.src = url;
                me.currentIframeSrc = url;
            }
        }

        // Обновляем информационную строку
        var infoText = mainPanel.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">Текущий объект: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('M25 Monitor: selected vehicle', vehicleName, 'vehid=', vehid, 'url=', url);
    }
});
