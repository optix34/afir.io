Ext.define('Store.oklik_clone.view.Main', {
    extend: 'Ext.container.Container',
    alias: 'widget.oklik_main',
    layout: 'border',

    items: [{
        region: 'center',
        xtype: 'oklik_task_list'
    }]
});
