#!/bin/bash
sed -i '/{\/\* Footer: Upgrade Plan & Auth \*\/}/,/}      <\/aside>/c\
        {/* Footer: User Profile */}\
        <div className="p-3 border-t border-[#22221f] bg-[#171714] space-y-2">\
          {user && (\
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-[#33332e] bg-[#20201d]">\
              <div className="flex items-center gap-2 overflow-hidden">\
                {user.avatar ? (\
                  <img src={user.avatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover shrink-0" />\
                ) : (\
                  <div className="w-7 h-7 rounded-full bg-[#3b82f6]/20 flex items-center justify-center shrink-0">\
                    <Shield className="w-3.5 h-3.5 text-[#3b82f6]" />\
                  </div>\
                )}\
                <div className="truncate">\
                  <div className="text-xs font-semibold text-[#ecece7] truncate">{user.name || user.email}</div>\
                  <div className="text-[10px] text-[#85857a] truncate">{user.email}</div>\
                </div>\
              </div>\
              <button onClick={onLogout} className="p-1.5 text-[#85857a] hover:text-[#ecece7] hover:bg-[#33332e] rounded-md transition-colors" title="Log out">\
                <LogOut className="w-3.5 h-3.5" />\
              </button>\
            </div>\
          )}\
        </div>\
      </aside>\
    </>\
  );\
};\
' src/components/Sidebar.tsx
