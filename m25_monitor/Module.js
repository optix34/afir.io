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
                { text: 'Оборудование', dataIndex: 'equipment', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } }
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

        me.loadM25Data(store, treePanel);
        me.treePanel = treePanel;
        return treePanel;
    },

    loadM25Data: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: loading data from /ax/current_data.php');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    console.log('M25 Monitor: raw response', resp);

                    var vehiclesArray = resp.objects;
                    if (!Ext.isArray(vehiclesArray)) {
                        console.error('M25 Monitor: objects field is not an array', vehiclesArray);
                        Ext.Msg.alert('Ошибка', 'Некорректный формат данных от сервера.');
                        return;
                    }

                    console.log('M25 Monitor: found ' + vehiclesArray.length + ' total vehicles');
                    var filtered = me.filterM25Vehicles(vehiclesArray);
                    console.log('M25 Monitor: filtered ' + filtered.length + ' vehicles with M25');

                    var treeData = [{
                        text: 'M25 Devices',
                        expanded: true,
                        children: filtered
                    }];

                    store.setRoot({ children: treeData });
                    if (treePanel && treePanel.getView) treePanel.getView().refresh();

                    if (filtered.length === 0) {
                        Ext.Msg.alert('Информация', 'Объекты с оборудованием M25 не найдены.');
                    }
                } catch (e) {
                    console.error('M25 Monitor: error parsing response', e);
                    Ext.Msg.alert('Ошибка', 'Ошибка обработки данных от сервера.');
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: request failed', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить список объектов.');
            }
        });
    },

    filterM25Vehicles: function(vehicles) {
        var me = this;
        var result = [];
        Ext.Array.each(vehicles, function(vehicle) {
            // Безопасное получение строки оборудования
            var equipment = vehicle.equipment || vehicle.hardware || vehicle.model || '';
            if (typeof equipment !== 'string') {
                equipment = String(equipment);
            }
            if (equipment.toLowerCase().indexOf('m25') !== -1) {
                result.push(me.normalizeVehicleNode(vehicle));
            }
        });
        return result;
    },

    normalizeVehicleNode: function(vehicle) {
        var equipment = vehicle.equipment || '';
        if (typeof equipment !== 'string') {
            equipment = String(equipment);
        }
        return {
            id: 'veh_' + (vehicle.vehid || vehicle.id),
            text: vehicle.text || vehicle.name || 'Без имени',
            vehid: vehicle.vehid || vehicle.id,
            imei: vehicle.imei || '',
            equipment: equipment,
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
                    }
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
                    }
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

        var iframe = mainPanel.iframe;
        if (iframe && iframe.getIframeDom) {
            var iframeDom = iframe.getIframeDom();
            if (iframeDom) {
                iframeDom.src = url;
                me.currentIframeSrc = url;
            }
        }

        var infoText = mainPanel.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">Текущий объект: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        console.log('M25 Monitor: selected', vehicleName, 'vehid=', vehid, 'url=', url);
    }
});
