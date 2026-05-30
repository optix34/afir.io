/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую панель (дерево M25) и правую панель (iframe).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Определяем путь к CSS относительно Module.js
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

    // Безопасная локализация
    l: function(text) {
        return (typeof l === 'function') ? l(text) : text;
    },

    initModule: function() {
        var me = this;
        console.log('[M25] Extension initializing...');

        // Проверяем наличие skeleton
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

        // Создаём левую панель. Navigation сам является LeftBarPanel.
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            title: me.l('M25 Monitor'),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit'
        });

        // Устанавливаем связь: левая панель знает о правой
        navPanel.setMainPanel(mainPanel);
        // Стандартное свойство PILOT для связи левой и правой панелей
        navPanel.map_frame = mainPanel;

        // Добавляем в интерфейс PILOT
        skeleton.navigation.add(navPanel);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Extension initialized successfully');
    }
});
