<script>
import Branch from './Branch.vue';
import Branches from './Branches.vue';
import CreatePage from './CreatePage.vue';
import MountCollection from './MountCollection.vue';
import HasLocaleSelector from '../HasLocaleSelector';
import HasShowDraftsSelector from '../HasShowDraftsSelector';

export default {

    mixins: [HasShowDraftsSelector, HasLocaleSelector],

    components: {
        Branches,
        Branch,
        CreatePage,
        MountCollection,
    },

    data: function() {
        return {
            loading: true,
            saving: false,
            changed: false,
            showUrls: false,
            show: "urls",
            pages: [],
            arePages: true
        }
    },

    computed: {

        homeEditUrl() {
            let url = cp_url('pages/edit');

            if (this.locale !== Object.keys(Statamic.locales)[0]) {
                url += '?locale=' + this.locale;
            }

            return url;
        },

        hasChildren() {
            return _.some(this.pages, page => page.items.length);
        },

        isSortable() {
            return Vue.can('pages:reorder');
        }

    },

    ready: function() {
        this.getPages();
        this.bindLocaleWatcher();
        this.bindShowDraftsWatcher();
        Mousetrap.bindGlobal('mod+s', (e) => {
            e.preventDefault();
            this.save();
        });
    },

    methods: {

        getPages: function() {
            this.pages = [];
            this.loading = true;
            var url = cp_url('/pages/get?locale='+this.locale+'&drafts='+(this.showDrafts ? 1 : 0));

            this.$http.get(url, function(data) {
                this.arePages = data.pages.length > 0;
                this.pages = data.pages;
                this.loading = false;

                this.$nextTick(function() {
                    this.initSortable();
                });
            });
        },

        initSortable: function() {
            if (! this.isSortable) {
                return;
            }

            var self = this;
            var draggedIndex, draggedPage, draggedInstance;

            var placeholder = '' +
                    '<li class="branch branch-placeholder">' +
                        '<div class="branch-row w-full flex items-center depth-{{ depth }}">' +
                            '<div class="page-move drag-handle w-6 h-full"></div>' +
                            '<div class="flex p-1 items-center flex-1">' +
                                '<div class="page-text">&nbsp;</div>' +
                            '</div>' +
                        '</div>' +
                    '</li>';

            $(this.$el).find('.page-tree > ul + ul').nestedSortable({
                containerSelector: 'ul',
                handle: '.drag-handle',
                placeholderClass: 'branch-placeholder',
                placeholder: placeholder,
                bodyClass: 'page-tree-dragging',
                draggedClass: 'branch-dragged',
                onMousedown: function ($item, _super, event) {
                    // Prevent dragging a lone top level page.
                    var branch = $item[0].__vue__;
                    var depth = parseInt($item[0].dataset.depth);
                    if (branch.$parent.pages.length === 1 && depth === 1) return false;
                    return true;
                },
                onDragStart: function($item, container, _super, event) {
                    // Grab the original page we're dragging now so we can move it later.
                    var branch = $item[0].__vue__;
                    draggedInstance = branch;
                    draggedIndex = branch.branchIndex;
                    draggedPage = branch.$parent.pages[draggedIndex];

                    // Let the plugin continue
                    _super($item, container);
                },
                onDrag: function($item, container, _super, event) {
                    // Update the placeholder template to show the page name.
                    $('.branch-placeholder').find('.page-text').text(draggedPage.title);
                    _super($item, container);
                },
                onDrop: function($item, container, _super, event) {
                    self.$els.click.play();
                    self.changed = true;

                    // Remove the page from its original place
                    draggedInstance.$parent.pages.splice(draggedIndex, 1);

                    // Get the drop position
                    var dropIndex = $item.index();
                    var parentInstance = $item.parent()[0].__vue__;

                    // Update the page to use the new parent's url (recursively)
                    draggedPage = self.updateDroppedUrl(draggedPage, parentInstance.$parent.url);

                    // Get the new page's position and inject it into the data
                    parentInstance.pages.splice(dropIndex, 0, draggedPage);

                    // Force the Vue component to reload itself
                    var pages = self.pages;
                    self.pages = [];
                    self.$nextTick(function() {
                        self.pages = pages;
                    });

                    // Let the plugin continue
                    _super($item, container);
                },
                isValidTarget: function ($item, container) {
                    // Prevent an item being dragging into a location where that slug already exists.
                    // It would be nice if there was some feedback in the UI as you do it, but the
                    // plugin doesn't seem to support it. We'll call this a workaround.
                    // https://github.com/statamic/v2-hub/issues/1938
                    const draggedSlug = $item[0].__vue__.slug;
                    return !container.items
                        .map(item => item.__vue__.slug)
                        .some(slug => slug === draggedSlug);
                }
            });
        },

        updateDroppedUrl: function(page, url) {
            var self = this;

            url = url || '';

            page.url = url + '/' + page.slug;

            page.items = _.map(page.items, function(child) {
                return self.updateDroppedUrl(child, page.url);
            });

            return page;
        },

        expandAll: function() {
            this.$els.card_set.play();
            this.toggleAll(false);
        },

        collapseAll: function() {
            this.$els.card_drop.play();
            this.toggleAll(true);
        },

        toggleAll: function(collapsed, pages) {
            var self = this;

            pages = pages || self.pages;

            _.each(pages, function(page) {
                Vue.set(page, 'collapsed', collapsed);
                if (page.items.length) {
                    self.toggleAll(collapsed, page.items);
                }
            });
        },

        toggleUrls: function() {
            this.showUrls = !this.showUrls;

            if (this.showUrls) {
                this.show = "titles";
            } else {
                this.show = "urls";
            }
        },

        save: function() {
            var self = this;

            self.saving = true;

            var pages = JSON.parse(JSON.stringify(self.pages));
            pages = self.updateOrderIndexes(pages);

            this.$http.post(cp_url('/pages'), { pages: pages }).success(function(data) {
                self.getPages();
                self.changed = false;
                self.saving = false;
                self.$dispatch('setFlashSuccess', translate('cp.pages_reordered'))
            });
        },

        updateOrderIndexes: function(pages) {
            var self = this;

            return _.map(pages, function(item, i) {
                // Recursively iterate over any children
                if (item.items.length) {
                    item.items = self.updateOrderIndexes(item.items);
                }

                // We need the 1-based indexes
                item.order = i + 1;

                return item;
            });
        },

        createPage: function(parent) {
            this.$broadcast('pages.create', parent);
        },

        onShowDraftsChanged() {
            this.getPages();
        },

        onLocaleChanged() {
            this.getPages();
        }

    },

    events: {
        'pages.create': function(parent) {
            this.$broadcast('pages.create', parent);
        },
        'pages.mount': function(id) {
            this.$broadcast('pages.mount', id);
        },
        'pages.unmount': function(id) {
            this.saving = true;
            this.$broadcast('pages.unmount', id);
        },
        'page.deleted': function () {
            if (this.pages.length > 1) {
                return;
            }

            $(this.$el).find('.page-tree > ul + ul').nestedSortable('destroy');
        }
    },

    watch: {
        changed(changed) {
            this.$dispatch('changesMade', changed);
        }
    }

};
</script>
