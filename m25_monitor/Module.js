/**
 * M25 Monitor - PILOT Extension
 * 
 * Отображает в левой навигации только объекты с типом устройства M25.
 * При выборе объекта в правой панели открывается iframe с https://mega-info.su/dealer2/
 * 
 * @class Store.m25_monitor.Module
 * @extends Ext.Component
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule started');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton, navigation or mapframe not found');
            return;
        }

        // Левая навигационная панель
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [{
                xtype: 'panel',
                layout: 'fit',
                border: false,
                items: me.createTreePanel()
            }]
        });

        // Главная панель с iframe
        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        console.log('M25 Monitor: navigation and main panel added');
    },

    createTreePanel: function() {
        var me = this;

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: 'M25 Devices',
                expanded: true,
                children: []
            },
            sorters: [{ property: 'text', direction: 'ASC' }]
        });

        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2, sortable: true },
                { text: 'IMEI', dataIndex: 'imei', flex: 1, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: 'Тип устройства', dataIndex: 'deviceType', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length && selected[0].get('type') === 'veh') {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') me.onVehicleSelected(record);
                },
                scope: me
            }
        });

        // Пытаемся загрузить данные через tags.php (с иерархией)
        me.loadDataFromTags(store, treePanel);
        me.treePanel = treePanel;
        return treePanel;
    },

    /**
     * Загрузка из /ax/mod/tags.php?cmd=groups (основной источник)
     */
    loadDataFromTags: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: loading from /ax/mod/tags.php?cmd=groups');

        Ext.Ajax.request({
            url: '/ax/mod/tags.php',
            params: {
                cmd: 'groups',
                _dc: new Date().getTime(),
                page: 1,
                start: 0,
                limit: 1000
            },
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    console.log('M25 Monitor: tags.php raw response', resp);

                    // Ожидаемая структура: resp.data — массив групп/объектов
                    var groups = resp.data || resp;
                    if (!Ext.isArray(groups)) {
                        groups = [groups];
                    }

                    var filteredRoot = me.filterM25FromGroups(groups);
                    console.log('M25 Monitor: filtered M25 devices from tags.php:', filteredRoot.length);

                    store.setRoot({ children: filteredRoot });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();

                    if (!filteredRoot.length || (filteredRoot.length === 1 && filteredRoot[0].children && filteredRoot[0].children.length === 0)) {
                        console.log('M25 Monitor: no M25 devices in tags.php, falling back to current_data.php');
                        me.fallbackToCurrentData(store, treePanel);
                    }
                } catch (e) {
                    console.error('M25 Monitor: error parsing tags.php', e);
                    me.fallbackToCurrentData(store, treePanel);
                }
            },
            failure: function(response) {
                console.warn('M25 Monitor: tags.php request failed (status ' + response.status + '), falling back');
                me.fallbackToCurrentData(store, treePanel);
            },
            scope: me
        });
    },

    /**
     * Рекурсивная фильтрация групп/дерева из tags.php
     * Оставляет только те узлы, которые являются ТС с типом M25,
     * и папки, содержащие такие ТС.
     */
    filterM25FromGroups: function(nodes) {
        var me = this;
        var result = [];

        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var isM25 = false;
            var deviceTypeValue = '';

            if (isVehicle) {
                // Пытаемся определить тип устройства по различным полям
                var typeFields = ['model', 'device_type', 'type_name', 'hardware', 'equipment', 'devicetype'];
                for (var i = 0; i < typeFields.length; i++) {
                    var val = node[typeFields[i]];
                    if (val !== undefined && val !== null) {
                        deviceTypeValue = String(val);
                        if (deviceTypeValue.toLowerCase() === 'm25') {
                            isM25 = true;
                            break;
                        }
                    }
                }
                // Дополнительная проверка: может быть поле 'type' со значением 'M25' (у некоторых API)
                if (!isM25 && node.type && String(node.type).toLowerCase() === 'm25') {
                    isM25 = true;
                    deviceTypeValue = node.type;
                }

                if (isM25) {
                    // Добавляем узел ТС
                    result.push(me.normalizeVehicleNode(node, deviceTypeValue));
                }
            } else {
                // Это папка/группа – обрабатываем детей
                var children = node.children || [];
                var filteredChildren = me.filterM25FromGroups(children);
                if (filteredChildren.length > 0) {
                    // Сохраняем группу с отфильтрованными детьми
                    result.push({
                        id: node.id || Ext.id(),
                        text: node.text || node.name || 'Папка',
                        type: 'group',
                        leaf: false,
                        expanded: false,
                        children: filteredChildren
                    });
                }
            }
        });

        return result;
    },

    /**
     * Резервный метод: загрузка из /ax/current_data.php (плоский список)
     */
    fallbackToCurrentData: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: fallback to /ax/current_data.php');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var vehicles = resp.objects || resp.data || resp;
                    if (!Ext.isArray(vehicles)) {
                        vehicles = [];
                    }
                    console.log('M25 Monitor: current_data.php vehicles count:', vehicles.length);

                    var filtered = me.filterM25VehiclesFlat(vehicles);
                    console.log('M25 Monitor: filtered M25 devices from current_data.php:', filtered.length);

                    var treeData = [{
                        text: 'M25 Devices',
                        expanded: true,
                        children: filtered
                    }];

                    store.setRoot({ children: treeData });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();

                    if (filtered.length === 0) {
                        Ext.Msg.alert('Информация', 'Объекты с типом устройства M25 не найдены ни в одном источнике.');
                    }
                } catch (e) {
                    console.error('M25 Monitor: error parsing current_data.php', e);
                    Ext.Msg.alert('Ошибка', 'Ошибка обработки данных от сервера.');
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: current_data.php request failed', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список объектов ни из одного API.');
            },
            scope: me
        });
    },

    /**
     * Фильтрация плоского массива транспортных средств (для current_data.php)
     */
    filterM25VehiclesFlat: function(vehicles) {
        var me = this;
        var result = [];
        var typeFields = ['model', 'device_type', 'type_name', 'hardware', 'equipment', 'devicetype'];

        Ext.Array.each(vehicles, function(vehicle) {
            var isM25 = false;
            var deviceTypeValue = '';

            for (var i = 0; i < typeFields.length; i++) {
                var val = vehicle[typeFields[i]];
                if (val !== undefined && val !== null) {
                    deviceTypeValue = String(val);
                    if (deviceTypeValue.toLowerCase() === 'm25') {
                        isM25 = true;
                        break;
                    }
                }
            }
            if (!isM25 && vehicle.type && String(vehicle.type).toLowerCase() === 'm25') {
                isM25 = true;
                deviceTypeValue = vehicle.type;
            }

            if (isM25) {
                result.push(me.normalizeVehicleNode(vehicle, deviceTypeValue));
            }
        });
        return result;
    },

    /**
     * Преобразование объекта ТС в узел дерева
     * @param {Object} vehicle
     * @param {String} detectedType (опционально) – уже определённый тип устройства
     */
    normalizeVehicleNode: function(vehicle, detectedType) {
        var deviceType = detectedType || '';
        if (!deviceType) {
            var typeFields = ['model', 'device_type', 'type_name', 'hardware', 'equipment', 'devicetype'];
            for (var i = 0; i < typeFields.length; i++) {
                var val = vehicle[typeFields[i]];
                if (val !== undefined && val !== null) {
                    deviceType = String(val);
                    break;
                }
            }
        }
        return {
            id: 'veh_' + (vehicle.vehid || vehicle.id),
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehicle.vehid || vehicle.id,
            imei: vehicle.imei || '',
            deviceType: deviceType,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    createMainPanel: function() {
        var me = this;

        var iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() { return this.getEl().dom; }
        });

        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: 'Обновить',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            var iframeEl = iframe.getIframeDom();
                            if (iframeEl) iframeEl.src = me.currentIframeSrc;
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

        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: 'M25 Monitor — внешняя страница',
            tbar: toolbar,
            items: [iframe]
        });

        mainPanel.iframe = iframe;
        me.currentIframeSrc = 'about:blank';
        return mainPanel;
    },

    onVehicleSelected: function(record) {
        var me = this;
        var mainPanel = me.mainPanel;
        if (!mainPanel) return;

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
            infoText.update('<span style="color:#2563eb;">Текущий объект: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('M25 Monitor: selected vehicle', vehicleName, 'vehid=', vehid, 'url=', url);
    }
});
