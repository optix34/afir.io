/**
 * M25 Monitor - PILOT Extension (монолитная версия с гибкой фильтрацией)
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
                try {
                    var data = Ext.decode(resp.responseText);
                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Пустой ответ от PILOT.'));
                        return;
                    }

                    // Диагностика: выведем первый транспорт для отладки
                    if (data.length) {
                        var sample = me.findFirstVehicle(data);
                        if (sample) {
                            console.log('[M25] Пример транспортного средства:', sample);
                            console.log('[M25] Все ключи:', Object.keys(sample));
                            console.log('[M25] Значение поля devicetype:', sample.devicetype);
                            console.log('[M25] Значение поля equipment:', sample.equipment);
                            console.log('[M25] Значение поля model:', sample.model);
                        }
                    }

                    var filtered = me.filterM25Nodes(data);
                    console.log('[M25] Отфильтровано объектов M25:', filtered.length);

                    store.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });

                    if (filtered.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12) для деталей.'));
                    }
                } catch (e) {
                    console.error('[M25] Ошибка:', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ сервера.'));
                }
            },
            failure: function() {
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные.'));
            }
        });
    },

    /**
     * Вспомогательная функция для диагностики: находит первый транспорт в дереве.
     */
    findFirstVehicle: function(nodes) {
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.type === 'veh' || n.vehid) return n;
            if (n.children) {
                var found = this.findFirstVehicle(n.children);
                if (found) return found;
            }
        }
        return null;
    },

    /**
     * Гибкое извлечение модели устройства из узла.
     * Пробует несколько возможных имён полей.
     */
    getEquipmentField: function(node) {
        var candidates = ['devicetype', 'equipment', 'model', 'device', 'hardware', 'type', 'tracker', 'equipment_name', 'device_model'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val !== undefined && val !== null && typeof val === 'string') {
                return val;
            }
        }
        // Если не нашли, ищем в любом поле, содержащем "equip" или "device" (регистронезависимо)
        for (var key in node) {
            if (typeof node[key] === 'string') {
                var lowerKey = key.toLowerCase();
                if (lowerKey.indexOf('equip') !== -1 || lowerKey.indexOf('device') !== -1 || lowerKey === 'type') {
                    return node[key];
                }
            }
        }
        return '';
    },

    filterM25Nodes: function(nodes) {
        var me = this, result = [];
        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            // Используем гибкое извлечение поля
            var equipmentValue = me.getEquipmentField(node);
            var hasM25 = equipmentValue && equipmentValue.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle && hasM25) {
                result.push(me.normalizeVehicleNode(node, equipmentValue));
            } else if (node.children && node.children.length) {
                var filteredChildren = me.filterM25Nodes(node.children);
                if (filteredChildren.length) {
                    result.push(me.normalizeGroupNode(node, filteredChildren));
                }
            }
        });
        return result;
    },

    normalizeVehicleNode: function(vehNode, equipmentValue) {
        return {
            text: vehNode.text || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: equipmentValue || vehNode.equipment || '',
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
