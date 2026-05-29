/**
 * M25 Monitor - PILOT Extension
 * Использует /ax/mod/tags.php?cmd=groups для получения дерева с оборудованием
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',
    extensionName: 'm25_monitor',

    initModule: function() {
        var me = this;
        console.log('M25 Monitor: initModule started');

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('M25 Monitor: skeleton not ready');
            return;
        }

        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: 'M25 Monitor',
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [{ xtype: 'panel', layout: 'fit', border: false, items: me.createTreePanel() }]
        });

        var mainPanel = me.createMainPanel();
        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);
        me.mainPanel = mainPanel;
        console.log('M25 Monitor: UI added');
    },

    createTreePanel: function() {
        var me = this;
        var store = Ext.create('Ext.data.TreeStore', {
            root: { text: 'M25 Devices', expanded: true, children: [] },
            sorters: [{ property: 'text', direction: 'ASC' }]
        });

        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: 'Объект', dataIndex: 'text', flex: 2 },
                { text: 'IMEI', dataIndex: 'imei', flex: 1, renderer: v => v || '—' },
                { text: 'Оборудование', dataIndex: 'equipment', flex: 1.5, renderer: v => v || '—' }
            ],
            listeners: {
                selectionchange: (sm, sel) => { if (sel[0]?.get('type') === 'veh') me.onVehicleSelected(sel[0]); },
                itemdblclick: (v, rec) => { if (rec.get('type') === 'veh') me.onVehicleSelected(rec); },
                scope: me
            }
        });

        me.loadDataFromTags(store, treePanel);
        me.treePanel = treePanel;
        return treePanel;
    },

    // Загрузка из /ax/mod/tags.php?cmd=groups
    loadDataFromTags: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: loading from /ax/mod/tags.php?cmd=groups');

        Ext.Ajax.request({
            url: '/ax/mod/tags.php',
            params: { cmd: 'groups', _dc: new Date().getTime(), page: 1, start: 0, limit: 1000 },
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    console.log('M25 Monitor: tags.php response', resp);

                    // Ожидаемая структура: resp.data — массив групп
                    var groups = resp.data || resp;
                    if (!Ext.isArray(groups)) groups = [groups];

                    var filteredRoot = me.filterM25FromGroups(groups);
                    store.setRoot({ children: filteredRoot });
                    if (treePanel.getView()) treePanel.getView().refresh();

                    if (!filteredRoot.length || (filteredRoot[0] && filteredRoot[0].children && filteredRoot[0].children.length === 0)) {
                        Ext.Msg.alert('Информация', 'Объекты с оборудованием M25 не найдены в tags.php');
                        me.fallbackToCurrentData(store, treePanel); // пробуем другой API
                    }
                } catch (e) {
                    console.error('M25 Monitor: error parsing tags.php', e);
                    me.fallbackToCurrentData(store, treePanel);
                }
            },
            failure: function() {
                console.warn('M25 Monitor: tags.php failed, fallback to current_data.php');
                me.fallbackToCurrentData(store, treePanel);
            }
        });
    },

    // Рекурсивный обход групп из tags.php
    filterM25FromGroups: function(groups) {
        var me = this;
        var result = [];
        Ext.Array.each(groups, function(group) {
            var children = group.children || [];
            var filteredChildren = me.filterM25FromGroups(children);
            // Если группа содержит отфильтрованных детей или сама группа – объект с M25
            var isM25Group = false;
            if (group.type === 'veh' || group.vehid) {
                var equipment = group.equipment || group.hardware || group.model || '';
                if (typeof equipment !== 'string') equipment = String(equipment);
                if (equipment.toLowerCase().indexOf('m25') !== -1) {
                    isM25Group = true;
                    result.push(me.normalizeVehicleNode(group));
                }
            }
            if (filteredChildren.length > 0) {
                result.push({
                    id: group.id || Ext.id(),
                    text: group.text || 'Папка',
                    type: 'group',
                    leaf: false,
                    expanded: false,
                    children: filteredChildren
                });
            } else if (isM25Group) {
                // уже добавили выше
            }
        });
        return result;
    },

    // Резервный метод – current_data.php (работает с плоским списком)
    fallbackToCurrentData: function(store, treePanel) {
        var me = this;
        console.log('M25 Monitor: fallback to /ax/current_data.php');

        Ext.Ajax.request({
            url: '/ax/current_data.php',
            method: 'GET',
            success: function(response) {
                try {
                    var resp = Ext.decode(response.responseText);
                    var vehicles = resp.objects || [];
                    if (!Ext.isArray(vehicles)) vehicles = [];
                    var filtered = me.filterM25VehiclesFlat(vehicles);
                    var treeData = [{ text: 'M25 Devices', expanded: true, children: filtered }];
                    store.setRoot({ children: treeData });
                    if (treePanel.getView()) treePanel.getView().refresh();
                    if (filtered.length === 0) Ext.Msg.alert('Информация', 'Объекты M25 не найдены в current_data.php');
                } catch (e) {
                    console.error('M25 Monitor: fallback error', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные ни из одного источника');
                }
            },
            failure: function() {
                Ext.Msg.alert('Ошибка', 'Нет доступа к API PILOT');
            }
        });
    },

    filterM25VehiclesFlat: function(vehicles) {
        var me = this;
        var result = [];
        Ext.Array.each(vehicles, function(veh) {
            var equipment = veh.equipment || veh.hardware || veh.model || '';
            if (typeof equipment !== 'string') equipment = String(equipment);
            if (equipment.toLowerCase().indexOf('m25') !== -1) {
                result.push(me.normalizeVehicleNode(veh));
            }
        });
        return result;
    },

    normalizeVehicleNode: function(vehicle) {
        var equipment = vehicle.equipment || '';
        if (typeof equipment !== 'string') equipment = String(equipment);
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
            autoEl: { tag: 'iframe', src: 'about:blank', style: 'width:100%;height:100%;border:none;' },
            getIframeDom: function() { return this.getEl().dom; }
        });
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                { text: 'Обновить', iconCls: 'fa fa-refresh', handler: function() { if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') { var iframeEl = iframe.getIframeDom(); if (iframeEl) iframeEl.src = me.currentIframeSrc; } } },
                { text: 'Открыть в новом окне', iconCls: 'fa fa-external-link', handler: function() { if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') window.open(me.currentIframeSrc, '_blank'); else Ext.Msg.alert('Информация', 'Сначала выберите объект.'); } },
                '->',
                { xtype: 'component', html: '<span style="color:#888;">Выберите объект в левой панели</span>', itemId: 'infoText' }
            ]
        });
        var mainPanel = Ext.create('Ext.panel.Panel', { layout: 'fit', title: 'M25 Monitor — внешняя страница', tbar: toolbar, items: [iframe] });
        mainPanel.iframe = iframe;
        me.currentIframeSrc = 'about:blank';
        return mainPanel;
    },

    onVehicleSelected: function(record) {
        var me = this, mainPanel = me.mainPanel;
        if (!mainPanel) return;
        var vehid = record.get('vehid'), vehicleName = record.get('text');
        var url = 'https://mega-info.su/dealer2/' + (vehid ? '?vehicle_id=' + encodeURIComponent(vehid) : '');
        var iframeDom = mainPanel.iframe.getIframeDom();
        if (iframeDom) { iframeDom.src = url; me.currentIframeSrc = url; }
        var infoText = mainPanel.down('#infoText');
        if (infoText) infoText.update('<span style="color:#2563eb;">Текущий объект: ' + Ext.String.htmlEncode(vehicleName) + '</span>');
        console.log('M25 Monitor: selected', vehicleName, vehid);
    }
});
