/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт левую панель (дерево M25) и правую панель (iframe + датчики).
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    // Определяем базовый URL для загрузки CSS и других ресурсов
    getModuleBaseUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        return location.pathname.replace(/\/[^/]*$/, '/');
    },

    initModule: function() {
        var me = this;
        console.log('[M25] Инициализация расширения...');

        // Проверка skeleton
        if (!window.skeleton || !skeleton.navigation || !skeleton.mapframe) {
            console.warn('[M25] Skeleton не готов, повтор через 500ms');
            Ext.defer(me.initModule, 500, me);
            return;
        }

        // Подключаем CSS (если ещё не подключён)
        var cssUrl = me.getModuleBaseUrl() + 'view/style.css';
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

        // Создаём левую навигацию (Navigation)
        var navPanel = Ext.create('Store.m25_monitor.view.Navigation', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit'
        });

        // Связываем панели
        navPanel.setMainPanel(mainPanel);

        // Оборачиваем в LeftBarPanel (как требует PILOT)
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: me.getTitle(),
            iconCls: 'fa fa-microchip',
            iconAlign: 'top',
            minimized: true,
            layout: 'fit',
            items: [navPanel]
        });
        navTab.map_frame = mainPanel;   // критично для связи

        // Добавляем в интерфейс
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        console.log('[M25] Расширение успешно загружено');
    },

    getTitle: function() {
        return (typeof l === 'function') ? l('M25 Monitor') : 'M25 Monitor';
    }
});
