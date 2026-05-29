/**
 * M25 Monitor - PILOT Extension (монолитная рабочая версия)
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    initModule: function() {
        var me = this;

        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.log.error('m25_monitor: skeleton not ready');
            return;
        }

        // Левая панель
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('M25 Monitor'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [me.createTreePanel()]
        });

        // Правая панель
        var mainPanel = me.createMainPanel();

        navTab.map_frame = mainPanel;

        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        me.mainPanel = mainPanel;
        Ext.log('[M25] Module started');
    },

    createTreePanel: function() {
        var me = this;
        var store = Ext.create('Ext.data.TreeStore', {
            root: { text: l('M25 Devices'), expanded: true, children: [] }
        });

        me.loadM25TreeData(store);

        return Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: l('Объект'), dataIndex: 'text', flex: 2 },
                { text: l('IMEI'), dataIndex: 'imei', flex: 1, renderer: function(v) { return v || '—'; } },
                { text: l('Оборудование'), dataIndex: 'equipment', flex: 1.5, renderer: function(v) { return v || '—'; } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected[0] && selected[0].get('vehid')) {
                        me.onVehicleSelected(selected[0]);
                    }
                },
                scope: me
            }
        });
    },

    loadM25TreeData: function(store) {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(resp) {
                var data = Ext.decode(resp.responseText);
                if (!data || !data.length) return;
                var filtered = me.filterM25Nodes(data);
                store.setRoot({ text: l('M25 Devices'), expanded: true, children: filtered });
                if (filtered.length === 0) Ext.Msg.alert(l('Информация'), l('Объекты M25 не найдены.'));
            },
            failure: function() { Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные.')); }
        });
    },

    filterM25Nodes: function(nodes) {
        var me = this, result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = (node.equipment || '').toLowerCase();
            var hasM25 = equipment.indexOf('m25') !== -1;
            if (isVehicle && hasM25) {
                result.push(me.normalizeVehicleNode(node));
            } else if (node.children && node.children.length) {
                var filteredChildren = me.filterM25Nodes(node.children);
                if (filteredChildren.length) {
                    result.push(me.normalizeGroupNode(node, filteredChildren));
                }
            }
        });
        return result;
    },

    normalizeVehicleNode: function(vehNode) {
        return {
            text: vehNode.text || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: vehNode.equipment || '',
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    normalizeGroupNode: function(groupNode, children) {
        return {
            text: groupNode.text || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: children
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
                { text: l('Обновить'), iconCls: 'fa fa-refresh', handler: function() { var d = iframe.getIframeDom(); if(d) d.src = d.src; } },
                { text: l('Открыть в новом окне'), iconCls: 'fa fa-external-link', handler: function() { if(me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') window.open(me.currentIframeSrc, '_blank'); else Ext.Msg.alert(l('Информация'), l('Сначала выберите объект.')); } },
                '->',
                { xtype: 'component', html: '<span style="color:#888;">' + l('Выберите объект в левой панели') + '</span>', itemId: 'infoText' }
            ]
        });
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: l('M25 Monitor — внешняя страница'),
            tbar: toolbar,
            items: [iframe],
            currentIframeSrc: 'about:blank'
        });
        mainPanel.iframe = iframe;
        mainPanel.toolbar = toolbar;
        return mainPanel;
    },

    onVehicleSelected: function(record) {
        var mainPanel = this.mainPanel;
        if (!mainPanel) return;
        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var url = 'https://mega-info.su/dealer2/';
        if (vehid) url += (url.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        var iframeDom = mainPanel.iframe.getIframeDom();
        if (iframeDom) { iframeDom.src = url; mainPanel.currentIframeSrc = url; }
        var infoText = mainPanel.down('#infoText');
        if (infoText) infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
    }
});
