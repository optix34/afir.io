Ext.define('Store.oklik_clone.Module', {
    extend: 'Ext.Component',

    initModule: function () {
        var me = this;

        // Создаём навигационную вкладку
        var navTab = Ext.create('Pilot.utils.LeftBarPanel', {
            title: l('Управление задачами'),
            iconCls: 'fa fa-tasks',
            iconAlign: 'top',
            minimized: true,
            items: []
        });

        // Основная панель – будет содержать главный view
        var mainPanel = Ext.create('Ext.panel.Panel', {
            layout: 'fit',
            items: [{
                xtype: 'oklik_main'
            }]
        });

        navTab.map_frame = mainPanel;
        skeleton.navigation.add(navTab);
        skeleton.mapframe.add(mainPanel);

        // Загружаем стили расширения
        var cssUrl = this.getModuleBaseUrl() + 'extension.css';
        Ext.util.CSS.swapStyleSheet('oklik_clone_css', cssUrl);
    },

    getModuleBaseUrl: function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('/Module.js') !== -1) {
                return src.replace('Module.js', '');
            }
        }
        return './';
    }
});
