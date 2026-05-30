/**
 * Navigation.js — левая панель с деревом объектов, фильтрованных по M25.
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: 'M25 Monitor',
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    mainPanel: null,
    treePanel: null,
    filterField: null,

    initComponent: function() {
        this.items = [this.createTreePanel()];
        this.dockedItems = [this.createToolbar()];
        this.callParent(arguments);
        this.loadData();
    },

    // Верхний тулбар с кнопками и поиском
    createToolbar: function() {
        var me = this;
        this.filterField = Ext.create('Ext.form.field.Text', {
            emptyText: (typeof l === 'function') ? l('Поиск...') : 'Поиск...',
            width: 200,
            enableKeyEvents: true,
            listeners: {
                change: {
                    buffer: 300,
                    fn: function(field, value) {
                        me.filterTree(value);
                    }
                }
            }
        });

        return {
            xtype: 'toolbar',
            dock: 'top',
            items: [
                {
                    text: (typeof l === 'function') ? l('Обновить') : 'Обновить',
                    iconCls: 'fa fa-sync-alt',
                    handler: function() { me.loadData(); },
                    scope: me
                },
                {
                    text: (typeof l === 'function') ? l('Развернуть всё') : 'Развернуть всё',
                    iconCls: 'fa fa-expand',
                    handler: function() { me.treePanel.expandAll(); },
                    scope: me
                },
                {
                    text: (typeof l === 'function') ? l('Свернуть всё') : 'Свернуть всё',
                    iconCls: 'fa fa-compress',
                    handler: function() { me.treePanel.collapseAll(); },
                    scope: me
                },
                '->',
                this.filterField
            ]
        };
    },

    createTreePanel: function() {
        var me = this;
        this.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                text: (typeof l === 'function') ? l('M25 Устройства') : 'M25 Устройства',
                expanded: true,
                children: []
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: this.treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [
                {
                    xtype: 'treecolumn',
                    text: (typeof l === 'function') ? l('Объект') : 'Объект',
                    dataIndex: 'text',
                    flex: 2,
                    sortable: true
                },
                {
                    text: 'IMEI',
                    dataIndex: 'imei',
                    flex: 1,
                    sortable: true,
                    renderer: function(v) { return v || '—'; }
                },
                {
                    text: (typeof l === 'function') ? l('Оборудование') : 'Оборудование',
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
                scope: me
            }
        });

        this.treePanel = tree;
        return tree;
    },

    loadData: function() {
        var me = this;
        if (this.treePanel) this.treePanel.setLoading(true);

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    if (!data || !data.length) {
                        throw new Error('Пустой ответ от /ax/tree.php');
                    }
                    // Диагностика: вывести первые 2 узла в консоль
                    console.log('[M25] Пример данных от PILOT:', data.slice(0, 2));
                    
                    var filtered = me.filterM25Nodes(data);
                    me.treeStore.setRoot({
                        text: (typeof l === 'function') ? l('M25 Устройства') : 'M25 Устройства',
                        expanded: true,
                        children: filtered
                    });
                    
                    if (filtered.length === 0) {
                        Ext.Msg.alert(
                            (typeof l === 'function') ? l('Информация') : 'Информация',
                            (typeof l === 'function') ? l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12).') : 'Объекты с M25 не найдены'
                        );
                    }
                } catch (e) {
                    console.error('[M25] Ошибка парсинга:', e);
                    Ext.Msg.alert('Ошибка', 'Не удалось разобрать ответ сервера');
                }
                if (me.treePanel) me.treePanel.setLoading(false);
            },
            failure: function(response) {
                console.error('[M25] AJAX ошибка:', response.status);
                Ext.Msg.alert('Ошибка', 'Не удалось загрузить данные. Статус: ' + response.status);
                if (me.treePanel) me.treePanel.setLoading(false);
            }
        });
    },

    // Рекурсивная фильтрация: оставляем только группы, содержащие M25-ТС, и сами ТС
    filterM25Nodes: function(nodes) {
        var me = this;
        var result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            // ИЗВЛЕКАЕМ ОБОРУДОВАНИЕ (пытаемся разные поля)
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

    // Извлечение модели трекера из разных возможных полей
    extractEquipment: function(node) {
        // Приоритетные поля (наиболее часто встречающиеся в PILOT)
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker', 'gps_type', 'module'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val && typeof val === 'string' && val.trim() !== '') {
                return val;
            }
        }
        // Дополнительный поиск по ключам, содержащим "equip", "device", "model"
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

    // Извлечение IMEI (поле может называться imei, serial, device_id)
    extractImei: function(node) {
        var imeiCandidates = ['imei', 'serial', 'device_id', 'tracker_serial'];
        for (var i = 0; i < imeiCandidates.length; i++) {
            var val = node[imeiCandidates[i]];
            if (val && typeof val === 'string' && val.trim() !== '') {
                return val;
            }
        }
        return '';
    },

    normalizeVehicle: function(vehNode, equipment) {
        return {
            text: vehNode.text || vehNode.name || (typeof l === 'function' ? l('Без имени') : 'Без имени'),
            vehid: vehNode.vehid,
            imei: this.extractImei(vehNode),
            equipment: equipment,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    normalizeGroup: function(groupNode, children) {
        return {
            text: groupNode.text || groupNode.name || (typeof l === 'function' ? l('Папка') : 'Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: children
        };
    },

    onVehicleSelect: function(record) {
        if (!this.mainPanel) {
            console.warn('[M25] MainPanel не задана');
            return;
        }
        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var imei = record.get('imei');
        var equipment = record.get('equipment');
        
        // Формируем URL для внешней страницы
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        
        // Передаём в MainPanel не только URL, но и данные ТС для отображения датчиков
        if (Ext.isFunction(this.mainPanel.loadVehicleData)) {
            this.mainPanel.loadVehicleData(vehid, vehicleName, imei, equipment, url);
        } else {
            // fallback
            if (this.mainPanel.loadUrl) this.mainPanel.loadUrl(url, vehicleName);
        }
    },

    setMainPanel: function(panel) {
        this.mainPanel = panel;
    },

    // Фильтрация дерева по введённому тексту
    filterTree: function(value) {
        if (!value) {
            this.treePanel.clearFilter();
            return;
        }
        this.treePanel.filterBy(function(node) {
            var text = node.get('text') || '';
            return text.toLowerCase().indexOf(value.toLowerCase()) !== -1;
        });
    }
});
