/**
 * Navigation.js — левая панель навигации (дерево) для M25 Monitor.
 * Загружает данные из /ax/tree.php, фильтрует объекты с оборудованием M25.
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: 'M25 Monitor',
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    mainPanel: null,          // ссылка на правую панель
    treePanel: null,
    filterField: null,
    treeStore: null,

    initComponent: function() {
        var me = this;
        me.items = [me.createTreePanel()];
        me.dockedItems = [me.createToolbar()];
        me.callParent(arguments);
        me.loadData();
    },

    // Безопасная локализация
    l: function(text) {
        return (typeof l === 'function') ? l(text) : text;
    },

    createToolbar: function() {
        var me = this;
        return {
            xtype: 'toolbar',
            dock: 'top',
            items: [
                {
                    iconCls: 'fa fa-search',
                    tooltip: me.l('Поиск'),
                    handler: function() {
                        me.filterField.focus();
                    }
                },
                '->',
                {
                    text: me.l('Развернуть всё'),
                    iconCls: 'fa fa-expand',
                    handler: function() {
                        me.treePanel.expandAll();
                        me.saveExpandedState();
                    }
                },
                {
                    text: me.l('Свернуть всё'),
                    iconCls: 'fa fa-compress',
                    handler: function() {
                        me.treePanel.collapseAll();
                        me.saveExpandedState();
                    }
                },
                {
                    iconCls: 'fa fa-sync-alt',
                    tooltip: me.l('Обновить список'),
                    handler: function() {
                        me.loadData();
                    }
                }
            ]
        };
    },

    createTreePanel: function() {
        var me = this;

        this.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                text: me.l('M25 Devices'),
                expanded: true,
                children: []
            }
        });

        // Поле фильтра
        this.filterField = Ext.create('Ext.form.field.Text', {
            emptyText: me.l('Поиск...'),
            width: 200,
            listeners: {
                change: {
                    buffer: 300,
                    fn: function(field, value) {
                        me.filterTree(value);
                    }
                }
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: this.treeStore,
            rootVisible: true,
            useArrows: true,
            dockedItems: [{
                xtype: 'toolbar',
                dock: 'top',
                items: [this.filterField]
            }],
            columns: [
                {
                    xtype: 'treecolumn',
                    text: me.l('Объект'),
                    dataIndex: 'text',
                    flex: 2,
                    sortable: true
                },
                {
                    text: me.l('IMEI'),
                    dataIndex: 'imei',
                    flex: 1,
                    sortable: true,
                    renderer: function(v) { return v || '—'; }
                },
                {
                    text: me.l('Оборудование'),
                    dataIndex: 'equipment',
                    flex: 1.5,
                    sortable: true,
                    renderer: function(v) { return v || '—'; }
                }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('type') === 'veh') {
                            me.onVehicleSelect(record);
                        }
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') {
                        me.onVehicleSelect(record);
                    }
                },
                scope: me
            }
        });

        this.treePanel = tree;
        return tree;
    },

    loadData: function() {
        var me = this;
        me.treePanel.setLoading(me.l('Загрузка...'));

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    if (!data || !data.length) {
                        throw new Error('Empty response');
                    }
                    var filtered = me.filterM25Nodes(data);
                    me.treeStore.setRoot({
                        text: me.l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });
                    me.restoreExpandedState();
                    if (filtered.length === 0) {
                        Ext.Msg.alert(me.l('Информация'), me.l('Объекты с оборудованием M25 не найдены.'));
                    }
                } catch (e) {
                    console.error('[M25] Parse error', e);
                    Ext.Msg.alert(me.l('Ошибка'), me.l('Некорректный ответ сервера.'));
                }
                me.treePanel.setLoading(false);
            },
            failure: function(response) {
                console.error('[M25] AJAX error', response.status);
                Ext.Msg.alert(me.l('Ошибка'), me.l('Не удалось загрузить данные. Статус: ') + response.status);
                me.treePanel.setLoading(false);
            }
        });
    },

    filterM25Nodes: function(nodes) {
        var me = this;
        var result = [];
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
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string') return val;
        }
        for (var key in node) {
            if (typeof node[key] === 'string' && (key.toLowerCase().indexOf('equip') !== -1 || key.toLowerCase().indexOf('device') !== -1)) {
                return node[key];
            }
        }
        return '';
    },

    normalizeVehicle: function(vehNode, equipment) {
        return {
            text: vehNode.text || vehNode.name || this.l('Без имени'),
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
            text: groupNode.text || groupNode.name || this.l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: children
        };
    },

    onVehicleSelect: function(record) {
        if (!this.mainPanel) {
            console.warn('[M25] No mainPanel reference');
            return;
        }
        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);

        if (Ext.isFunction(this.mainPanel.loadUrl)) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else {
            // fallback
            var iframeDom = this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
        }
        // Сохраняем последний выбранный ID для возможного восстановления
        localStorage.setItem('m25_last_vehid', vehid);
    },

    setMainPanel: function(panel) {
        this.mainPanel = panel;
    },

    // Фильтрация дерева по тексту (простейшая)
    filterTree: function(value) {
        var me = this;
        if (!value) {
            me.treePanel.clearFilter();
            return;
        }
        me.treePanel.filterBy(function(node) {
            var text = node.get('text') || '';
            return text.toLowerCase().indexOf(value.toLowerCase()) !== -1;
        });
    },

    // Сохранение развёрнутых узлов
    saveExpandedState: function() {
        var expanded = [];
        this.treePanel.getRootNode().cascadeBy(function(node) {
            if (node.isExpanded() && node.getDepth() > 0) {
                expanded.push(node.getPath('id'));
            }
        });
        localStorage.setItem('m25_expanded_nodes', Ext.encode(expanded));
    },

    restoreExpandedState: function() {
        var saved = localStorage.getItem('m25_expanded_nodes');
        if (!saved) return;
        var paths = Ext.decode(saved);
        Ext.Array.each(paths, function(path) {
            var node = this.treePanel.getRootNode().findChildBy(function(n) {
                return n.getPath('id') === path;
            });
            if (node) node.expand();
        }, this);
    }
});
