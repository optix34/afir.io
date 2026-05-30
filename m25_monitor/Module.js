/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую панель (дерево M25) и правую панель (iframe).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // URL к CSS относительно расположения Module.js
    getCssUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src;
            if (src && src.indexOf('/Module.js') !== -1) {
                return src.replace('Module.js', 'view/style.css');
            }
        }
        return './view/style.css';
    },

    initModule: function() {
        var me = this;
        console.log('[M25] Extension initializing...');

        // Защита: проверяем наличие skeleton
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.error('[M25] Skeleton not ready, retry in 500ms');
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS, если ещё не подключён
        var cssUrl = me.getCssUrl();
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }

        // Создаём правую панель (MainPanel)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        // Создаём левую панель навигации
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit'
        });

        // Связываем панели
        navPanel.setMainPanel(mainPanel);
        navPanel.mainPanelRef = mainPanel;

        // Оборачиваем в LeftBarPanel (требование PILOT)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navPanel]
        });

        // Ключевая связь: левая панель указывает на правую
        navTab.map_frame = mainPanel;

        // Добавляем в интерфейс PILOT
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Extension initialized successfully');
    },

    getTitle: function() {
        // Безопасная локализация
        if (typeof l === 'function') {
            return l('M25 Monitor');
        }
        return 'M25 Monitor';
    }
});
