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

        // Проверка наличия skeleton и необходимых контейнеров
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            Ext.log.error('m25_monitor: skeleton, navigation or mapframe not found');
            return;
        }

        // 1. Создаём левую навигационную панель (вкладка)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('M25 Monitor'),          // локализованный заголовок
            iconCls: 'fa fa-microchip',       // иконка Font Awesome 6
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [
                Ext.create('Ext.panel.Panel', {
                    layout: 'fit',
                    border: false,
                    items: me.createTreePanel()   // дерево с фильтрацией
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
    },

    /**
     * Создаёт TreePanel с загрузкой и фильтрацией объектов M25
     * @return {Ext.tree.Panel}
     */
    createTreePanel: function() {
        var me = this;

        // Создаём TreeStore без корневых данных, они будут загружены через AJAX
        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []               // временно пусто, заполним после загрузки
            },
            // Сортируем папки и объекты по имени
            sorters: [{
                property: 'text',
                direction: 'ASC'
            }]
        });

        // Загружаем данные из PILOT
        me.loadM25TreeData(store);

        // Создаём TreePanel с тремя колонками
        var treePanel = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,            // показываем корневой узел "M25 Devices"
            useArrows: true,              // стрелки вместо плюсиков/минусиков
            columns: [
                {
                    xtype: 'treecolumn',
                    text: l('Объект'),
                    dataIndex: 'text',
                    flex: 2,
                    sortable: true
                },
                {
                    text: l('IMEI'),
                    dataIndex: 'imei',
                    flex: 1,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                },
                {
                    text: l('Оборудование'),
                    dataIndex: 'equipment',
                    flex: 1.5,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                }
            ],
            listeners: {
                // Обработчик выбора узла (только для транспортных средств, не для папок)
                selectionchange: function(sm, selected) {
                    if (selected && selected.length > 0) {
                        var node = selected[0];
                        // Если узел является транспортным средством (type === 'veh' или есть vehid)
                        if (node && (node.get('type') === 'veh' || node.get('vehid'))) {
                            me.onVehicleSelected(node);
                        }
                    }
                },
                scope: me
            },
            // Обработчик двойного клика (опционально, тоже открывает)
            itemdblclick: function(view, record) {
                if (record.get('type') === 'veh' || record.get('vehid')) {
                    me.onVehicleSelected(record);
                }
            }
        });

        return treePanel;
    },

    /**
     * Загружает /ax/tree.php, фильтрует ветки, содержащие M25, и заполняет store
     * @param {Ext.data.TreeStore} store
     */
    loadM25TreeData: function(store) {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: {
                vehs: 1,
                state: 1
            },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные из PILOT. Пустой ответ.'));
                        return;
                    }

                    // Фильтруем данные: оставляем только группы и объекты, связанные с M25
                    var filteredRootChildren = me.filterM25Nodes(data);

                    // Обновляем корневой узел store
                    store.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filteredRootChildren
                    });

                    if (filteredRootChildren.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены.'));
                    }
                } catch (e) {
                    Ext.log.error('m25_monitor: ошибка парсинга ответа', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ от сервера PILOT.'));
                }
            },
            failure: function(response) {
                Ext.log.error('m25_monitor: ошибка загрузки /ax/tree.php', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить список объектов. Проверьте соединение.'));
            },
            scope: me
        });
    },

    /**
     * Рекурсивно фильтрует дерево, оставляя только группы, содержащие M25-объекты,
     * и сами объекты с оборудованием M25.
     * @param {Array} nodes - массив узлов (группы и/или транспортные средства)
     * @return {Array} отфильтрованный массив узлов
     */
    filterM25Nodes: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            // Является ли узел транспортным средством
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = node.equipment || '';
            var hasM25 = equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle) {
                // Если это транспорт и оборудование содержит M25 - добавляем
                if (hasM25) {
                    result.push(me.normalizeVehicleNode(node));
                }
            } else {
                // Это группа (папка) - рекурсивно обрабатываем детей
                var children = node.children || [];
                var filteredChildren = me.filterM25Nodes(children);
                if (filteredChildren.length > 0) {
                    // Копируем узел группы, заменяем children на отфильтрованные
                    var groupNode = me.normalizeGroupNode(node);
                    groupNode.children = filteredChildren;
                    result.push(groupNode);
                }
            }
        });

        return result;
    },

    /**
     * Нормализует узел транспортного средства для использования в TreeStore
     * @param {Object} vehNode - исходный узел из /ax/tree.php
     * @return {Object} узел для TreeStore
     */
    normalizeVehicleNode: function(vehNode) {
        return {
            text: vehNode.text || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: vehNode.equipment || '',
            type: 'veh',
            leaf: true,        // лист дерева
            iconCls: 'fa fa-car'  // иконка для объекта
        };
    },

    /**
     * Нормализует узел группы (папки) для TreeStore
     * @param {Object} groupNode - исходный узел группы
     * @return {Object} узел группы для TreeStore
     */
    normalizeGroupNode: function(groupNode) {
        return {
            text: groupNode.text || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,   // изначально свёрнуто
            children: []
        };
    },

    /**
     * Создаёт главную панель (правую область) с iframe и панелью инструментов
     * @return {Ext.panel.Panel}
     */
    createMainPanel: function() {
        var me = this;

        // Создаём iframe (будем обновлять его src при выборе объекта)
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

        // Создаём панель инструментов
        var toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: l('Обновить'),
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        var iframeEl = iframe.getIframeDom();
                        if (iframeEl) {
                            iframeEl.src = iframeEl.src;  // перезагрузка
                        }
                    },
                    scope: me
                },
                {
                    text: l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        var currentSrc = me.currentIframeSrc;
                        if (currentSrc && currentSrc !== 'about:blank') {
                            window.open(currentSrc, '_blank');
                        } else {
                            Ext.Msg.alert(l('Информация'), l('Сначала выберите объект.'));
                        }
                    },
                    scope: me
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#888;">' + l('Выберите объект в левой панели') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });

        // Основная панель с fit-макетом, содержащая iframe
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            title: l('M25 Monitor — внешняя страница'),
            tbar: toolbar,
            items: [iframe],
            // Храним текущий src iframe
            currentIframeSrc: 'about:blank'
        });

        // Сохраняем ссылки для доступа из обработчиков
        mainPanel.iframe = iframe;
        mainPanel.toolbar = toolbar;
        me.mainPanel = mainPanel;

        return mainPanel;
    },

    /**
     * Обработчик выбора транспортного средства
     * Обновляет iframe в главной панели
     * @param {Ext.data.NodeInterface} record - выбранная запись
     */
    onVehicleSelected: function(record) {
        var me = this;
        var mainPanel = me.mainPanel;
        if (!mainPanel) return;

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');

        // Базовый URL внешней страницы
        var baseUrl = 'https://mega-info.su/dealer2/';
        // Пытаемся добавить параметр vehicle_id (если сайт поддерживает, иначе просто baseUrl)
        var url = baseUrl;
        if (vehid) {
            // Параметр может называться ?id= или ?vehicle_id=, используем оба варианта
            // Обычно mega-info.su может не поддерживать, но оставляем для возможности
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        // Обновляем iframe
        var iframe = mainPanel.iframe;
        if (iframe && iframe.getIframeDom) {
            var iframeDom = iframe.getIframeDom();
            if (iframeDom) {
                iframeDom.src = url;
                mainPanel.currentIframeSrc = url;
            }
        }

        // Обновляем информационное сообщение в тулбаре
        var infoText = mainPanel.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
        }

        // Логируем действие (для отладки)
        Ext.log('m25_monitor: выбран объект ' + vehicleName + ' (vehid=' + vehid + '), загружена страница ' + url);
    }
});
