/**
 * Navigation.js – левая панель с деревом объектов, фильтрованных по M25.
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: l('M25 Monitor'),
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    mainPanel: null, // будет установлен Module.js

    initComponent: function() {
        this.items = this.createTreePanel();
        this.callParent(arguments);
        this.loadData();
    },

    createTreePanel: function() {
        var me = this;

        this.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: this.treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: l('Объект'), dataIndex: 'text', flex: 2, sortable: true },
                { text: l('IMEI'), dataIndex: 'imei', flex: 1, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: l('Оборудование'), dataIndex: 'equipment', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('type') === 'veh') me.onVehicleSelect(record);
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') me.onVehicleSelect(record);
                },
                scope: me
            }
        });
        return tree;
    },

    loadData: function() {
        var me = this;
        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    console.log('[M25] Raw tree data sample:', data[0]); // диагностика

                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Пустой ответ от PILOT.'));
                        return;
                    }

                    var filtered = me.filterM25Nodes(data);
                    console.log('[M25] Filtered vehicles count:', filtered.length);

                    me.treeStore.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });

                    if (filtered.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12) для деталей.'));
                    }
                } catch (e) {
                    console.error('[M25] Parse error', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ сервера.'));
                }
            },
            failure: function(response) {
                console.error('[M25] AJAX error', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные. Статус: ' + response.status));
            },
            scope: me
        });
    },

    filterM25Nodes: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = me.extractEquipment(node);
            var hasM25 = equipment && equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle && hasM25) {
                result.push(me.normalizeVehicle(node, equipment));
            } else if (node.children && node.children.length) {
                var filteredChildren = me.filterM25Nodes(node.children);
                if (filteredChildren.length) {
                    result.push(me.normalizeGroup(node, filteredChildren));
                }
            }
        });
        return result;
    },

    extractEquipment: function(node) {
        // Пробуем разные названия поля с моделью трекера
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string') return val;
        }
        // Если не нашли, ищем в любом строковом поле, содержащем "equip" или "device"
        for (var key in node) {
            if (typeof node[key] === 'string' && (key.toLowerCase().indexOf('equip') !== -1 || key.toLowerCase().indexOf('device') !== -1)) {
                return node[key];
            }
        }
        return '';
    },

    normalizeVehicle: function(vehNode, equipment) {
        return {
            text: vehNode.text || vehNode.name || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: equipment,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    normalizeGroup: function(groupNode, children) {
        return {
            text: groupNode.text || groupNode.name || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: children
        };
    },

    onVehicleSelect: function(record) {
        if (!this.mainPanel) return;
        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var url = 'https://mega-info.su/dealer2/';
        if (vehid) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }
        // Если MainPanel поддерживает метод loadUrl – используем, иначе прямой iframe
        if (this.mainPanel.loadUrl) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else if (this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom) {
            var iframeDom = this.mainPanel.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
            var infoText = this.mainPanel.down('#infoText');
            if (infoText) {
                infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
            }
        }
    },

    setMainPanel: function(panel) {
        this.mainPanel = panel;
    }
});
