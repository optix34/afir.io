/**
 * M25 Monitor — PILOT Extension
 * Версия без левой боковой панели.
 * Добавляет кнопку в хедер PILOT, при клике открывает модальное окно
 * со списком M25-устройств (слева) и iframe с информацией (справа).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Храним ссылку на окно, чтобы не открывать несколько копий
    monitorWindow: null,

    /**
     * Определяет базовый URL, откуда загружается расширение
     * (нужно для подгрузки CSS и других ресурсов).
     * @return {String}
     */
    getModuleBaseUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        // fallback – текущий путь
        return location.pathname.replace(/\/[^/]*$/, '/');
    },

    /**
     * Точка входа, вызывается PILOT после загрузки расширения.
     */
    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения (без левой панели)...');

        // Ждём, пока skeleton полностью инициализируется
        if (!window.skeleton || !skeleton.header) {
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS расширения
        var cssUrl = me.getModuleBaseUrl() + 'view/style.css';
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }

        // Добавляем кнопку в хедер PILOT
        if (skeleton.header && Ext.isFunction(skeleton.header.insert)) {
            skeleton.header.insert(5, {
                xtype: 'button',
                cls: 'header_tool m25-monitor-header-btn',
                iconCls: 'fa fa-microchip',
                tooltip: (typeof l === 'function') ? l('M25 Monitor') : 'M25 Monitor',
                handler: me.openMonitorWindow,
                scope: me
            });
            console.log('[M25] Кнопка успешно добавлена в хедер PILOT');
        } else {
            console.error('[M25] Не удалось добавить кнопку: skeleton.header.insert недоступен');
        }
    },

    /**
     * Открывает модальное окно с интерфейсом M25 Monitor.
     * Если окно уже открыто, просто показывает его.
     */
    openMonitorWindow: function() {
        var me = this;

        // Если окно уже существует и не уничтожено – просто показываем
        if (me.monitorWindow && !me.monitorWindow.isDestroyed) {
            me.monitorWindow.show();
            me.monitorWindow.toFront();
            return;
        }

        // Создаём правую панель (MainPanel) – будет отображать iframe и датчики
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            region: 'center'
        });

        // Создаём левую панель (Navigation) – дерево объектов с фильтрацией M25
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            region: 'west',
            width: 450,
            split: true,
            collapsible: true,
            title: (typeof l === 'function') ? l('M25 Устройства') : 'M25 Устройства',
            iconCls: 'fa fa-list'
        });
        // Связываем навигацию с главной панелью
        navPanel.setMainPanel(mainPanel);

        // Создаём окно с Border-раскладкой
        me.monitorWindow = Ext.create('Ext.window.Window', {
            title: (typeof l === 'function') ? l('M25 Monitor — устройства с трекерами M25') : 'M25 Monitor',
            width: 1200,
            height: 700,
            layout: 'border',
            modal: false,          // не блокируем остальной интерфейс
            maximizable: true,
            closeAction: 'destroy', // при закрытии окно уничтожается
            items: [navPanel, mainPanel],
            listeners: {
                destroy: function() {
                    me.monitorWindow = null;
                }
            }
        });

        me.monitorWindow.show();
        console.log('[M25] Модальное окно открыто');
    }
});
