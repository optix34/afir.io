Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    extensionName: 'm25_monitor',

    getModuleBaseUrl: function() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        return './';
    },

    initModule: function() {
        console.log('[M25] Инициализация расширения (все объекты клиента)...');

        if (!window.skeleton || !skeleton.mapframe) {
            console.warn('[M25] Skeleton.mapframe не готов, повтор через 500ms');
            Ext.defer(this.initModule, 500, this);
            return;
        }

        // Подключаем CSS
        var cssUrl = this.getModuleBaseUrl() + 'view/style.css';
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.appendChild(link);
        }

        // Создаём главную панель (с гридом всех ТС и iframe)
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id()
        });

        skeleton.mapframe.add(mainPanel);
        console.log('[M25] Расширение загружено, отображаются все объекты клиента');
    }
});
